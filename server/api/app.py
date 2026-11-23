# -*- coding: utf-8 -*-
"""
I.F 2026 LIVE — 티켓 예매 백엔드
표준 라이브러리만 씁니다. 설치할 것이 없습니다.

  py -3 server/api/app.py

비밀 값(계좌 · 관리자 비밀번호 · 관리 화면 주소)은 코드에 없습니다.
server/api/config.json(저장소에 올리지 않음)이나 환경 변수에서 읽습니다. config.example.json 참고.

127.0.0.1:8787 에서만 듣습니다. 바깥에서 오는 요청은 Caddy 가 /api/* 만 넘겨줍니다.
자료는 data/orders.json 한 파일에 담깁니다. 쓸 때마다 통째로 새로 쓰고(원자적 교체),
쓰기 전 사본을 data/backup/ 에 남깁니다.
"""

import base64
import csv
import gzip
import hashlib
import hmac
import io
import ipaddress
import json
import math
import os
import re
import secrets
import shutil
import socket
import sys
import threading
import time
import unicodedata
import zlib
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ---------------------------------------------------------------- 기본 설정

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, 'data')
BACKUP_DIR = os.path.join(DATA_DIR, 'backup')
DB_PATH = os.path.join(DATA_DIR, 'orders.json')
SECRET_PATH = os.path.join(DATA_DIR, 'secret.key')
CONFIG_PATH = os.path.join(HERE, 'config.json')
# 셋리스트 하이라이트 음원 목록 (사이트 폴더 안). 관리 화면의 편집기가 구간 · 페이드를 고칩니다.
AUDIO_JSON = os.path.normpath(os.path.join(HERE, '..', '..', 'site', 'data', 'audio.json'))
AUDIO_LOCK = threading.Lock()
# 방문 통계: 사이트가 보낸 신호를 날짜별로 쌓는 곳, 그리고 과거 방문자를 셈할 Caddy 접속 기록이 있는 곳
STATS_DIR = os.path.join(DATA_DIR, 'stats')
CADDY_LOG_DIR = os.path.join(os.path.dirname(HERE), 'logs')
# 셋리스트 '기대돼요'(곡마다 하트): 곡 목록은 사이트의 setlist.json 에서 읽고, 누른 기록은 likes.json 에 둡니다
SETLIST_JSON = os.path.normpath(os.path.join(HERE, '..', '..', 'site', 'data', 'setlist.json'))
LIKES_PATH = os.path.join(DATA_DIR, 'likes.json')
GACHA_PATH = os.path.join(DATA_DIR, 'gacha.json')
# 명예의 전당 꽃(숨은 재미): 현판을 연타하면 한 사람에 한 송이. 피운 차례대로 섞은 번호만 적어 둡니다
FLOWERS_PATH = os.path.join(DATA_DIR, 'flowers.json')

KST = timezone(timedelta(hours=9))
HOST = '127.0.0.1'
PORT = 8787

DEFAULT_CONFIG = {
    # 입금 받을 계좌. 실제 값은 config.json 에만 적습니다.
    "bank": "OO은행",
    "account": "000-0000-0000",
    "holder": "예금주",
    "price": 5500,
    "doorPrice": 6500,
    # 사전 예매 마감: 공연 전날 자정까지 (공연 당일은 현장 구매만)
    "presaleEndAt": "2026-11-04T23:59:59+09:00",
    "eventAt": "2026-11-05T19:00:00+09:00",
    # 가챠 추첨 번호를 받는 시간 (공연 시작 ~ 끝)
    "gachaOpenAt": "2026-11-05T19:00:00+09:00",
    "gachaCloseAt": "2026-11-06T02:00:00+09:00",
    # 관리자 비밀번호. config.json 이나 IF_ADMIN_PASSWORD 로 꼭 정하세요. 비어 있으면 로그인이 막힙니다.
    "adminPassword": "",
    # 관리 화면 주소. 추측하기 어려운 값으로 config.json 이나 IF_STAFF_PATH 에 정하세요 (Caddyfile 의 STAFF_PATH 와 같게).
    "staffPath": "/staff-change-me",
    "maxQtyPerOrder": 99,
    # 시험 기간에만 true. 관리 화면에 "시험 자료 비우기" 단추가 생깁니다.
    # 홍보를 시작하기 전에 false 로 바꾸세요. 그러면 단추가 사라지고 비우기가 막힙니다.
    "testMode": True,
    "siteUrl": "https://ifband.kro.kr"
}


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with io.open(CONFIG_PATH, encoding='utf-8') as f:
                cfg.update(json.load(f))
        except Exception as e:
            log('config.json 을 읽지 못했습니다. 기본값으로 갑니다: %s' % e)
    else:
        save_json(CONFIG_PATH, cfg)
    # 환경 변수가 있으면 그쪽이 먼저입니다 (비밀 값을 파일에 두기 싫을 때)
    for env, key in (('IF_ADMIN_PASSWORD', 'adminPassword'), ('IF_STAFF_PATH', 'staffPath'),
                     ('IF_BANK', 'bank'), ('IF_ACCOUNT', 'account'), ('IF_HOLDER', 'holder')):
        if os.environ.get(env):
            cfg[key] = os.environ[env]
    return cfg


try:  # 로그의 한글이 깨지지 않도록
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


LOG_PATH = os.path.join(os.path.dirname(HERE), 'logs', 'api.log')
_log_lock = threading.Lock()


def log(msg):
    """화면과 기록 파일 양쪽에 남깁니다.

    부팅 자동 시작으로 돌 때는 화면이 없습니다. 그래서 파일에 직접 씁니다.
    """
    line = '[%s] %s' % (datetime.now(KST).strftime('%m-%d %H:%M:%S'), msg)
    try:
        print(line, flush=True)
    except Exception:
        pass
    try:
        with _log_lock:
            os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
            # 기록이 한없이 불어나지 않게, 가끔 뒤쪽만 남깁니다
            if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > 2 * 1024 * 1024:
                with io.open(LOG_PATH, encoding='utf-8', errors='replace') as f:
                    keep = f.readlines()[-800:]
                with io.open(LOG_PATH, 'w', encoding='utf-8') as f:
                    f.writelines(keep)
            with io.open(LOG_PATH, 'a', encoding='utf-8') as f:
                f.write(line + '\n')
    except Exception:
        pass


def now():
    return datetime.now(KST)


def iso(dt):
    return dt.isoformat(timespec='seconds')


def parse_iso(s):
    try:
        return datetime.fromisoformat(str(s))
    except Exception:
        return None


def save_json(path, obj):
    tmp = path + '.tmp'
    with io.open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


# ---------------------------------------------------------------- 저장소

class Store(object):
    """orders.json 을 감싸는 아주 작은 저장소. 모든 접근은 한 개의 잠금 아래에서."""

    def __init__(self):
        self.lock = threading.RLock()
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(BACKUP_DIR, exist_ok=True)
        self.db = self._read()

    def _read(self):
        if not os.path.exists(DB_PATH):
            return {"orders": []}
        try:
            with io.open(DB_PATH, encoding='utf-8') as f:
                db = json.load(f)
            if not isinstance(db.get('orders'), list):
                db = {"orders": []}
            return db
        except Exception as e:
            log('!! orders.json 을 읽지 못했습니다: %s' % e)
            broken = os.path.join(BACKUP_DIR, 'broken-%s.json' % now().strftime('%Y%m%d-%H%M%S'))
            try:
                shutil.copy2(DB_PATH, broken)
                log('   깨진 파일을 %s 에 두었습니다.' % broken)
            except Exception:
                pass
            return {"orders": []}

    def _write(self):
        if os.path.exists(DB_PATH):
            stamp = now().strftime('%Y%m%d')
            try:
                shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR, 'orders-%s.json' % stamp))
            except Exception:
                pass
        save_json(DB_PATH, self.db)

    def all(self):
        with self.lock:
            return list(self.db['orders'])

    def by_code(self, code):
        with self.lock:
            for o in self.db['orders']:
                if o.get('code') == code:
                    return o
        return None

    def by_token(self, token):
        # 토큰은 영문·숫자·_-  뿐입니다. 그 밖의 글자가 섞여 오면 볼 것도 없이 없는 티켓입니다.
        # (한글 같은 글자가 섞이면 compare_digest 가 오류를 냅니다)
        token = str(token or '')
        if not TOKEN_RE.match(token):
            return None
        with self.lock:
            for o in self.db['orders']:
                if secrets.compare_digest(str(o.get('token', '')), token):
                    return o
        return None

    def find(self, name, code):
        """이름 + 예매번호로 찾기. 이름은 공백/대소문자를 무시하고 맞춰봅니다."""
        want = norm_name(name)
        with self.lock:
            for o in self.db['orders']:
                if o.get('code') == code and norm_name(o.get('name', '')) == want:
                    return o
        return None

    def new_code(self):
        """쓰이지 않은 네 자리 번호. 이미 쓰인 번호는 절대 다시 주지 않습니다."""
        with self.lock:
            used = set(o.get('code') for o in self.db['orders'])
            if len(used) >= 9000:
                raise RuntimeError('번호가 바닥났습니다')
            while True:
                code = '%04d' % secrets.randbelow(10000)
                if code[0] == '0':  # 앞자리 0 은 은행 입금자명에서 헷갈립니다
                    continue
                if code not in used:
                    return code

    def clear(self):
        """모든 예매를 지웁니다. 지우기 전 사본을 backup 에 남깁니다."""
        with self.lock:
            n = len(self.db['orders'])
            if os.path.exists(DB_PATH):
                stamp = now().strftime('%Y%m%d-%H%M%S')
                try:
                    shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR, 'before-clear-%s.json' % stamp))
                except Exception:
                    pass
            self.db['orders'] = []
            self._write()
        return n

    def add(self, order):
        with self.lock:
            self.db['orders'].append(order)
            self._write()
        return order

    def update(self, code, patch):
        with self.lock:
            for o in self.db['orders']:
                if o.get('code') == code:
                    o.update(patch)
                    self._write()
                    return o
        return None


TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{16,64}$')


def norm_name(s):
    s = unicodedata.normalize('NFC', str(s or ''))
    return re.sub(r'\s+', '', s).lower()


# ---------------------------------------------------------------- 관리자 세션

def get_secret():
    if os.path.exists(SECRET_PATH):
        with io.open(SECRET_PATH, encoding='utf-8') as f:
            return f.read().strip().encode('utf-8')
    key = secrets.token_urlsafe(32)
    os.makedirs(DATA_DIR, exist_ok=True)
    with io.open(SECRET_PATH, 'w', encoding='utf-8') as f:
        f.write(key)
    log('관리자 서명 키를 새로 만들었습니다: %s' % SECRET_PATH)
    return key.encode('utf-8')


SECRET = None  # main 에서 채웁니다
SESSION_HOURS = 12


def make_session():
    exp = str(int(time.time()) + SESSION_HOURS * 3600)
    sig = hmac.new(SECRET, exp.encode(), hashlib.sha256).hexdigest()[:32]
    return '%s.%s' % (exp, sig)


def check_session(tok):
    try:
        exp, sig = str(tok).split('.', 1)
        good = hmac.new(SECRET, exp.encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, good):
            return False
        return int(exp) > time.time()
    except Exception:
        return False


# ---------------------------------------------------------------- 조회 시도 제한

class Throttle(object):
    """같은 곳에서 번호를 마구 찍어보는 것을 막습니다."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.hits = {}
        self.lock = threading.Lock()

    def hit(self, key):
        t = time.time()
        with self.lock:
            arr = [x for x in self.hits.get(key, []) if t - x < self.window]
            arr.append(t)
            self.hits[key] = arr
            if len(self.hits) > 4000:  # 오래된 기록 청소
                for k in list(self.hits):
                    self.hits[k] = [x for x in self.hits[k] if t - x < self.window]
                    if not self.hits[k]:
                        del self.hits[k]
            return len(arr) <= self.limit


lookup_guard = Throttle(limit=12, window=600)   # 10분에 12번
order_guard = Throttle(limit=10, window=600)    # 10분에 10건
login_guard = Throttle(limit=10, window=900)    # 15분에 10번

STORE = None
CONFIG = None


# ---------------------------------------------------------------- 규칙

NAME_RE = re.compile(r'^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ][0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ ]{0,11}$')


def clean_name(raw):
    s = unicodedata.normalize('NFC', str(raw or '')).strip()
    s = re.sub(r'\s+', ' ', s)
    if not NAME_RE.match(s):
        return None
    return s


def presale_open():
    end = parse_iso(CONFIG['presaleEndAt'])
    return bool(end and now() <= end)


def public_order(o, is_admin=False):
    d = {
        "code": o.get('code'),
        "name": o.get('name'),
        "qty": o.get('qty'),
        "amount": o.get('amount'),
        "status": o.get('status'),
        "createdAt": o.get('createdAt'),
        "paidAt": o.get('paidAt'),
        "usedQty": o.get('usedQty', 0),
        "enteredQty": o.get('enteredQty', 0),
        "enteredAt": o.get('enteredAt'),
        "depositName": deposit_name(o),
    }
    if is_admin:
        d['memo'] = o.get('memo', '')
        d['token'] = o.get('token')
    return d


def deposit_name(o):
    return '%s%s' % (re.sub(r'\s+', '', o.get('name', '')), o.get('code', ''))


# ---------------------------------------------------------------- 방문 통계
#
# 사이트가 보내는 작은 묶음(POST /api/t)을 날짜별 파일 data/stats/ev-YYYYMMDD.jsonl 에 한 줄씩 쌓고,
# 관리 화면이 물으면(/api/admin/stats, /api/admin/heat) 그 파일들을 읽어 숫자로 줄여 줍니다.
# IP · 원본 User-Agent · 이름 · 연락처는 어디에도 적지 않습니다. 익명 번호와 기기 종류만 남깁니다.
# 약속(필드 이름 · 응답 모양)은 관리 화면 · 사이트 수집 스크립트와 함께 정한 것이라 함부로 바꾸지 마세요.

STATS_BODY_MAX = 16 * 1024          # 한 묶음 최대 크기
STATS_EVENTS_MAX = 60               # 한 묶음 최대 이벤트 수
STATS_DAY_MAX = 50 * 1024 * 1024    # 하루 파일이 이만큼 차면 그날은 더 받지 않습니다 (장난 방지)
STATS_CACHE_SEC = 15                # 관리 화면이 자주 물어도 15초 동안은 계산해 둔 것을 줍니다
STATS_LIVE_SEC = 5 * 60             # '지금 보는 사람' = 최근 5분 안에 신호를 보낸 방문자
STAFF_PATH = DEFAULT_CONFIG['staffPath']  # main 에서 config 값으로 바꿉니다
SITE_HOSTS = ('ifband.kro.kr', 'www.ifband.kro.kr', 'localhost', '127.0.0.1')
LOG_PAGES = {'/': '/', '/index.html': '/', '/ticket': '/ticket', '/ticket.html': '/ticket',
             '/sponsors': '/sponsors', '/sponsors.html': '/sponsors'}
HOME_SECS = ('top', 'hero', 'info', 'setlist', 'sponsor', 'notice', 'footer')
SRC_KEYS = ('qr', 'insta', 'kakao', 'everytime', 'naver', 'google', 'youtube', 'fb', 'band', 'other', 'direct')
PERF_KEYS = ('lcp', 'fcp', 'ttfb', 'inp', 'cls')
FUNNEL = (('visit', '사이트 방문'), ('ticket', '티켓 페이지'), ('start', '예매 작성 시작'),
          ('ok', '예매 신청 완료'), ('paid', '입금 확인'))

beacon_guard = Throttle(limit=300, window=600)   # 같은 IP 에서 10분에 300묶음까지 (IP 는 메모리에서만 셉니다)
_ev_lock = threading.Lock()         # 날짜 파일에 덧붙이기
_agg_lock = threading.RLock()       # 집계 계산 (동시에 두 번 계산하지 않게)
_caddy_lock = threading.Lock()      # 접속 기록 셈
_warned = {}

ID_RE = re.compile(r'^[A-Za-z0-9_-]{6,40}$')
KEY_RE = re.compile(r'^[A-Za-z0-9_-]{1,40}$')
FROM_RE = re.compile(r'^[A-Za-z0-9_-]{1,32}$')
LANG_RE = re.compile(r'^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$')
PATH_RE = re.compile(r'^/[A-Za-z0-9._~/-]{0,60}$')
CTRL_RE = re.compile(r'[\x00-\x1f\x7f]+')
BOT_RE = re.compile(
    r'bot|crawl|spider|slurp|scrap|headless|externalhit|preview|curl|wget|python|powershell|'
    r'go-http|java/|okhttp|httpclient|axios|node-fetch|libwww|censys|check|\+https?:|palo ?alto|scan|'
    r'lighthouse|pingdom|uptime|monitor|phantom|selenium|puppeteer|playwright|inspect|yeti|daumoa|'
    r'petal|semrush|ahrefs|zgrab|nmap|nikto|sqlmap|httpx|nuclei|aiohttp|requests|postman', re.I)


def stats_warn(key, msg):
    """같은 문제는 10분에 한 번만 기록합니다 (신호마다 적으면 기록이 넘칩니다)."""
    t = time.time()
    if t - _warned.get(key, 0) > 600:
        _warned[key] = t
        log(msg)


def is_bot(ua):
    """사람이 쓰는 브라우저가 아니면 True. 브라우저는 모두 'Mozilla/' 를 달고 옵니다."""
    ua = str(ua or '')
    return 'Mozilla/' not in ua or bool(BOT_RE.search(ua))


def ua_info(ua):
    """User-Agent 에서 기기 · 운영체제 · 브라우저 · 앱만 뽑습니다. 원본 문자열은 버립니다."""
    low = str(ua or '')[:800].lower()
    ios = 'iphone' in low or 'ipad' in low or 'ipod' in low
    if 'ipad' in low or 'tablet' in low or ('android' in low and 'mobile' not in low):
        dev = 't'
    elif ios or 'mobi' in low or 'android' in low:
        dev = 'm'
    else:
        dev = 'd'
    if ios:
        osn = 'ios'
    elif 'android' in low:
        osn = 'android'
    elif 'windows' in low:
        osn = 'win'
    elif 'macintosh' in low or 'mac os x' in low:
        osn = 'mac'
    elif 'linux' in low or 'x11' in low or 'cros ' in low:
        osn = 'linux'
    else:
        osn = 'other'
    if 'whale/' in low:
        br = 'whale'
    elif 'samsungbrowser/' in low:
        br = 'samsung'
    elif 'edg/' in low or 'edga/' in low or 'edgios/' in low or 'edge/' in low:
        br = 'edge'
    elif 'firefox/' in low or 'fxios/' in low:
        br = 'firefox'
    elif 'crios/' in low or 'chrome/' in low:
        br = 'chrome'
    elif ios or 'safari/' in low:     # 아이폰 안의 앱 화면은 모두 사파리 엔진입니다
        br = 'safari'
    else:
        br = 'other'
    if 'kakaotalk' in low:
        app = 'kakao'
    elif 'instagram' in low:
        app = 'insta'
    elif 'fban/' in low or 'fbav/' in low or 'fb_iab' in low or 'fbios' in low:
        app = 'fb'
    elif 'naver(' in low or 'naver/' in low:
        app = 'naver'
    elif 'everytime' in low:
        app = 'everytime'
    elif re.search(r'\bline/', low):
        app = 'line'
    elif re.search(r'\bband/', low):
        app = 'band'
    else:
        app = ''
    return {"dev": dev, "os": osn, "br": br, "app": app}


def stats_source(frm, app, ref):
    """유입 분류. 주소의 ?from= 값이 먼저, 없으면 앱(카톡·인스타 안 화면), 없으면 이전 주소의 도메인."""
    if isinstance(frm, str) and FROM_RE.match(frm):
        k = frm.lower()
        return k if k in SRC_KEYS else 'from:' + frm
    if app in ('kakao', 'insta', 'fb', 'naver', 'everytime', 'band'):
        return app
    if app:                             # 목록에 없는 앱 (라인 등)
        return 'other'
    ref = str(ref or '').strip()
    if not ref:
        return 'direct'
    try:
        h = (urlparse(ref).hostname or '').lower()
    except Exception:
        h = ''
    if not h:
        return 'other'
    if h in SITE_HOSTS or h.endswith('.ifband.kro.kr'):
        return 'direct'                 # 우리 사이트 안에서 넘어온 것
    if 'instagram' in h or h == 'ig.me':
        return 'insta'
    if 'kakao' in h:
        return 'kakao'
    if 'everytime' in h:
        return 'everytime'
    if 'naver' in h:
        return 'naver'
    if 'youtube' in h or h == 'youtu.be':
        return 'youtube'
    if 'google' in h:
        return 'google'
    if 'facebook' in h or h in ('fb.com', 'fb.me', 'm.me') or h.endswith('.fb.com'):
        return 'fb'
    if h == 'band.us' or h.endswith('.band.us'):
        return 'band'
    return 'other'


def stats_path(p):
    """'/ticket.html?x=1' → '/ticket'. 이상한 경로면 None."""
    if not isinstance(p, str):
        return None
    p = p.split('?')[0].split('#')[0].strip()
    if p.endswith('.html'):
        p = p[:-5]
    if p in ('', '/index'):
        p = '/'
    if len(p) > 1:
        p = p.rstrip('/') or '/'
    return p if PATH_RE.match(p) else None


def _num(v):
    """숫자면 float, 아니면 None (참/거짓 · NaN · 무한대는 숫자로 치지 않습니다)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    v = float(v)
    if v != v or v in (float('inf'), float('-inf')):
        return None
    return v


def _clamp(v, lo, hi):
    v = _num(v)
    return None if v is None else min(max(v, lo), hi)


def _within(v, lo, hi):
    v = _num(v)
    return v if (v is not None and lo <= v <= hi) else None


def _text(v, n):
    if not isinstance(v, str):
        return ''
    return re.sub(r'\s+', ' ', CTRL_RE.sub(' ', v)).strip()[:n]


def clean_event(e):
    """이벤트 하나를 검사해 정리합니다. 모르는 종류이거나 꼭 있어야 할 값이 틀리면 None (그 이벤트만 버림)."""
    if not isinstance(e, dict):
        return None
    t = e.get('t')
    out = {'t': t}
    ms = _within(e.get('ms'), 1e12, 1e13)
    if ms is not None:
        out['ms'] = int(ms)
    if t == 'pv':
        ref = _text(e.get('ref'), 200)
        if ref:
            out['ref'] = ref
        src = e.get('src')
        if isinstance(src, str) and FROM_RE.match(src):
            out['src'] = src
        for k in ('vw', 'vh'):
            x = _clamp(e.get(k), 0, 20000)
            if x is not None:
                out[k] = int(x)
        x = _clamp(e.get('dpr'), 0.5, 8)
        if x is not None:
            out['dpr'] = round(x, 2)
        lang = e.get('lang')
        if isinstance(lang, str) and len(lang) <= 20 and LANG_RE.match(lang):
            out['lang'] = lang
    elif t in ('c', 'r'):
        sec = e.get('sec')
        if not (isinstance(sec, str) and KEY_RE.match(sec)):
            return None
        out['sec'] = sec
        if t == 'c':
            # 0~1 이어야 합니다. 반올림 때문에 살짝 넘친 것만 받아 주고, 크게 벗어나면 버립니다
            rx = _within(e.get('rx'), -0.05, 1.05)
            ry = _within(e.get('ry'), -0.05, 1.05)
            if rx is None or ry is None:
                return None
            out['rx'] = round(min(max(rx, 0.0), 1.0), 3)
            out['ry'] = round(min(max(ry, 0.0), 1.0), 3)
            out['lbl'] = _text(e.get('lbl'), 80) or 'bg'
            x = _clamp(e.get('vw'), 0, 20000)
            if x is not None:
                out['vw'] = int(x)
    elif t == 'hb':
        act = _clamp(e.get('act'), 0, 86400000)     # 하루를 넘는 값은 하루로
        dep = _clamp(e.get('dep'), 0, 1)
        if act is None and dep is None:
            return None
        if act is not None:
            out['act'] = int(act)
        if dep is not None:
            out['dep'] = round(dep, 3)
    elif t == 'song':
        song = _text(e.get('song'), 60)
        a = e.get('a')
        if not song or a not in ('play', 'stop', 'end'):
            return None
        out['song'] = song
        out['a'] = a
        out['sec'] = round(_clamp(e.get('sec'), 0, 3600) or 0, 1)
    elif t == 'tk':
        a = e.get('a')
        if a not in ('start', 'submit', 'ok', 'err'):
            return None
        out['a'] = a
        if a == 'ok':
            qty = _clamp(e.get('qty'), 1, 99)
            if qty is not None:
                out['qty'] = int(qty)
    elif t == 'share':
        how = e.get('how')
        if not (isinstance(how, str) and len(how) <= 20 and KEY_RE.match(how)):
            return None
        out['how'] = how
    elif t == 'perf':
        for k in ('lcp', 'fcp', 'ttfb', 'inp'):
            x = _within(e.get(k), 0, 600000)
            if x is not None:
                out[k] = int(round(x))
        x = _within(e.get('cls'), 0, 10)
        if x is not None:
            out['cls'] = round(x, 3)
        if not any(k in out for k in PERF_KEYS):
            return None
    elif t == 'err':
        msg = _text(e.get('msg'), 200)
        if not msg:
            return None
        out['msg'] = msg
        out['src'] = _text(e.get('src'), 300).split('?')[0].split('#')[0].rsplit('/', 1)[-1][:80]
        out['line'] = int(_clamp(e.get('line'), 0, 10000000) or 0)
    else:
        return None
    return out


def clean_batch(b):
    """한 페이지뷰의 묶음 전체를 검사합니다. 번호 · 경로가 틀리거나 이벤트가 너무 많으면 통째로 None."""
    if not isinstance(b, dict):
        return None
    v, s, pid = b.get('v'), b.get('s'), b.get('pid')
    for x in (v, s, pid):
        if not (isinstance(x, str) and ID_RE.match(x)):
            return None
    p = stats_path(b.get('p'))
    q = b.get('q')
    if p is None or not isinstance(q, list) or len(q) > STATS_EVENTS_MAX:
        return None
    events = []
    errs = 0
    for e in q:
        c = clean_event(e)
        if c is None:
            continue
        if c['t'] == 'err':
            errs += 1
            if errs > 5:
                continue
        events.append(c)
    if not events:
        return None
    return {"v": v, "s": s, "pid": pid, "p": p, "n": 1 if b.get('n') in (1, '1') else 0, "q": events}


def stats_collect(h):
    """POST /api/t 한 건을 받아 둡니다. 무엇이 틀려도 조용히 버릴 뿐 오류를 내지 않습니다."""
    body = getattr(h, '_body', b'') or b''
    if not body or len(body) > STATS_BODY_MAX:
        return False
    ua = h.headers.get('User-Agent') or ''
    if is_bot(ua):
        return False
    if h.is_admin():                    # 관리자로 로그인한 기기(운영진)는 세지 않습니다
        return False
    if not beacon_guard.hit(h.client_key()):
        return False
    try:
        b = json.loads(body.decode('utf-8'))
    except Exception:
        return False
    c = clean_batch(b)
    if c is None:
        return False
    t = now()
    rec = {"at": iso(t), "v": c['v'], "s": c['s'], "pid": c['pid'], "p": c['p'], "n": c['n'],
           "ua": ua_info(ua), "q": c['q']}
    return stats_append(rec, t)


def stats_append(rec, t):
    """하루 파일(KST 날짜)에 한 줄 덧붙입니다."""
    path = os.path.join(STATS_DIR, 'ev-%s.jsonl' % t.strftime('%Y%m%d'))
    line = (json.dumps(rec, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    with _ev_lock:
        os.makedirs(STATS_DIR, exist_ok=True)
        try:
            size = os.path.getsize(path)
        except OSError:
            size = 0
        if size + len(line) > STATS_DAY_MAX:
            stats_warn('full' + path, '!! 오늘 통계 파일이 %dMB 를 넘어 더 받지 않습니다 (장난 신호일 수 있음).'
                       % (STATS_DAY_MAX // (1024 * 1024)))
            return False
        with open(path, 'ab') as f:
            f.write(line)
    return True


# ---- 쌓인 파일 읽기: 날짜 파일 하나를 '페이지뷰(pid)별 기록'으로 줄여 기억해 둡니다 ----
# 지난 날짜 파일은 바뀌지 않으므로 한 번만 읽고, 오늘 파일은 늘어난 뒷부분만 이어 읽습니다.

_day_cache = {}


def _ev_days():
    """통계 폴더에 있는 날짜들 ('YYYYMMDD', 오름차순)."""
    try:
        names = os.listdir(STATS_DIR)
    except OSError:
        return []
    out = []
    for n in names:
        m = re.match(r'^ev-(\d{8})\.jsonl$', n)
        if m:
            out.append(m.group(1))
    return sorted(out)


def _load_day(ds):
    """그날의 {pid: 기록}. _agg_lock 안에서 부릅니다."""
    path = os.path.join(STATS_DIR, 'ev-%s.jsonl' % ds)
    try:
        size = os.path.getsize(path)
    except OSError:
        _day_cache.pop(ds, None)
        return {}
    c = _day_cache.get(ds)
    if c is None or c['path'] != path or size < c['off']:
        c = {'path': path, 'off': 0, 'pvs': {}}
        _day_cache[ds] = c
    if size > c['off']:
        with open(path, 'rb') as f:
            f.seek(c['off'])
            chunk = f.read(size - c['off'])
        end = chunk.rfind(b'\n')        # 아직 다 안 쓴 마지막 줄은 다음에
        if end >= 0:
            for raw in chunk[:end].split(b'\n'):
                _apply_batch(c['pvs'], raw)
            c['off'] += end + 1
    return c['pvs']


def _apply_batch(pvs, raw):
    """jsonl 한 줄을 페이지뷰 기록에 보탭니다. 깨진 줄은 건너뜁니다."""
    try:
        b = json.loads(raw.decode('utf-8'))
        pid, v, s = b.get('pid'), b.get('v'), b.get('s')
        if not (isinstance(pid, str) and isinstance(v, str) and isinstance(s, str)):
            return
        at = parse_iso(b.get('at'))
        if at is None:
            return
        t = at.timestamp()
        r = pvs.get(pid)
        if r is None:
            u = b.get('ua') if isinstance(b.get('ua'), dict) else {}
            r = pvs[pid] = {
                'v': v, 's': s, 'p': str(b.get('p') or '/'),
                'ua': (str(u.get('dev') or 'd'), str(u.get('os') or 'other'),
                       str(u.get('br') or 'other'), str(u.get('app') or '')),
                't0': t, 't1': t, 'new': False, 'src': None, 'act': 0, 'dep': 0.0,
                'secs': [], 'clicks': [], 'songs': [], 'tk': {}, 'shares': [], 'perf': {}, 'errs': [],
            }
        r['t0'] = min(r['t0'], t)
        r['t1'] = max(r['t1'], t)
        if b.get('n') == 1:
            r['new'] = True
        for e in b.get('q') or []:
            if not isinstance(e, dict):
                continue
            k = e.get('t')
            if k == 'pv':
                if r['src'] is None:
                    r['src'] = stats_source(e.get('src'), r['ua'][3], e.get('ref'))
            elif k == 'hb':
                r['act'] = max(r['act'], _num(e.get('act')) or 0)
                r['dep'] = max(r['dep'], _num(e.get('dep')) or 0)
            elif k == 'r':
                sec = e.get('sec')
                if isinstance(sec, str) and sec not in r['secs']:
                    r['secs'].append(sec)
            elif k == 'c':
                r['clicks'].append((t, str(e.get('lbl') or 'bg'), str(e.get('sec')),
                                    _num(e.get('rx')) or 0, _num(e.get('ry')) or 0))
            elif k == 'song':
                r['songs'].append((str(e.get('song')), e.get('a'), _num(e.get('sec')) or 0))
            elif k == 'tk':
                r['tk'][str(e.get('a'))] = e.get('qty') or True
            elif k == 'share':
                r['shares'].append(str(e.get('how')))
            elif k == 'perf':
                for m in PERF_KEYS:
                    x = _num(e.get(m))
                    if x is not None:
                        r['perf'][m] = x
            elif k == 'err':
                r['errs'].append((str(e.get('msg')), str(e.get('src') or ''), int(_num(e.get('line')) or 0),
                                  str(b.get('at'))))
    except Exception:
        return


def _merge_rec(a, b):
    """자정을 넘긴 페이지뷰처럼 두 날짜 파일에 나뉜 기록을 하나로 (원래 기록은 건드리지 않습니다)."""
    r = dict(a)
    r['t0'] = min(a['t0'], b['t0'])
    r['t1'] = max(a['t1'], b['t1'])
    r['new'] = a['new'] or b['new']
    r['src'] = a['src'] if a['src'] is not None else b['src']
    r['act'] = max(a['act'], b['act'])
    r['dep'] = max(a['dep'], b['dep'])
    r['secs'] = a['secs'] + [x for x in b['secs'] if x not in a['secs']]
    for k in ('clicks', 'songs', 'shares', 'errs'):
        r[k] = a[k] + b[k]
    r['tk'] = dict(a['tk'], **b['tk'])
    r['perf'] = dict(a['perf'], **b['perf'])
    return r


def stats_days_arg(raw):
    """?days= 값: 1 · 7 · 30 · all (그 밖의 숫자도 1~366 안에서 받아 줍니다)."""
    raw = str(raw or 'all').strip().lower()
    if raw == 'all':
        return 'all'
    try:
        return min(max(int(raw), 1), 366)
    except ValueError:
        return 'all'


def _pctl(arr, p, k):
    """백분위 (가까운 순위 방식). 값이 없으면 None. cls 만 소수 3자리, 나머지는 ms 정수."""
    if not arr:
        return None
    arr = sorted(arr)
    x = arr[max(0, int(math.ceil(p * len(arr))) - 1)]
    return round(x, 3) if k == 'cls' else int(round(x))


def _top(counter):
    return [{"k": k, "n": n} for k, n in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))]


def _add(counter, k, n=1):
    counter[k] = counter.get(k, 0) + n


def build_stats(days):
    """관리 화면의 통계 한 벌 (SPEC §3 모양 그대로)."""
    t_now = now()
    today = t_now.date()
    logd = log_days()
    with _agg_lock:
        files = set(_ev_days())
        since = None
        for ds in sorted(files):
            if _load_day(ds):
                since = ds
                break
        if days == 'all':
            cands = [today]
            if since:
                cands.append(datetime.strptime(since, '%Y%m%d').date())
            if logd:
                cands.append(datetime.strptime(min(logd), '%Y-%m-%d').date())
            first = min(cands)
        else:
            first = today - timedelta(days=days - 1)

        # 기간 안 날짜 파일을 모아 페이지뷰별로 합칩니다
        merged = {}
        daily = []
        log_only = []           # 사이트 수집이 없던 날의 접속 기록 (유입 · 기기에 보탭니다)
        d = first
        while d <= today:
            ds = d.strftime('%Y%m%d')
            dd = d.isoformat()
            recs = _load_day(ds) if ds in files else {}
            vs, ss = set(), set()
            for pid, r in recs.items():
                vs.add(r['v'])
                ss.add(r['s'])
                old = merged.get(pid)
                merged[pid] = r if old is None else _merge_rec(old, r)
            lg = logd.get(dd)
            daily.append({"d": dd, "visitors": len(vs), "sessions": len(ss), "pageviews": len(recs),
                          "logVisitors": lg['visitors'] if lg else None,
                          "logPageviews": lg['pageviews'] if lg else None})
            if not recs and lg:
                log_only.append(lg)
            d += timedelta(days=1)

        visitors = {}           # v -> (처음 본 시각, 기기)
        new_v = set()
        sess = {}
        pages = {}
        reach = {}
        clicks = {}
        songs = {}
        ticket_v, start_v, ok_v = set(), set(), set()
        perf = {'m': dict((k, []) for k in PERF_KEYS), 'd': dict((k, []) for k in PERF_KEYS)}
        errors = {}
        shares = {}
        for pid, r in merged.items():
            v = r['v']
            cur = visitors.get(v)
            if cur is None or r['t0'] < cur[0]:
                visitors[v] = (r['t0'], r['ua'])
            if r['new']:
                new_v.add(v)
            se = sess.get(r['s'])
            if se is None:
                se = sess[r['s']] = {'t0': r['t0'], 'n': 0, 'act': 0, 'src': None, 'st': None}
            se['t0'] = min(se['t0'], r['t0'])
            se['n'] += 1
            se['act'] += r['act']
            if r['src'] is not None and (se['st'] is None or r['t0'] < se['st']):
                se['src'], se['st'] = r['src'], r['t0']
            pg = pages.get(r['p'])
            if pg is None:
                pg = pages[r['p']] = {'pv': 0, 'v': set(), 'act': 0}
            pg['pv'] += 1
            pg['v'].add(v)
            pg['act'] += r['act']
            if r['p'] == '/ticket':
                ticket_v.add(v)
            rs = reach.setdefault(r['p'], {})
            for sec in r['secs']:
                _add(rs, sec)
            for c in r['clicks']:
                if c[1] == 'bg':        # 빈 곳 누름은 순위에서 빼고 히트맵에만 씁니다
                    continue
                ck = clicks.get((c[1], r['p']))
                if ck is None:
                    ck = clicks[(c[1], r['p'])] = [0, set()]
                ck[0] += 1
                ck[1].add(v)
            for song, a, sec in r['songs']:
                sg = songs.setdefault(song, [0, 0, 0.0, 0])   # 재생, 끝까지, 들은 초 합, 들은 횟수
                if a == 'play':
                    sg[0] += 1
                else:
                    if a == 'end':
                        sg[1] += 1
                    sg[2] += sec
                    sg[3] += 1
            if 'start' in r['tk']:
                start_v.add(v)
            if 'ok' in r['tk']:
                ok_v.add(v)
            bucket = perf['m' if r['ua'][0] in ('m', 't') else 'd']
            for k, x in r['perf'].items():
                bucket[k].append(x)
            for msg, src, line, at in r['errs']:
                er = errors.get((msg, src, line))
                if er is None:
                    er = errors[(msg, src, line)] = {'n': 0, 'last': '', 'p': r['p']}
                er['n'] += 1
                if at >= er['last']:
                    er['last'], er['p'] = at, r['p']
            for how in r['shares']:
                _add(shares, how)

        n_v = len(visitors)
        n_s = len(sess)
        hourly = [0] * 24
        sources = {}
        for se in sess.values():
            hourly[datetime.fromtimestamp(se['t0'], KST).hour] += 1
            _add(sources, se['src'] or 'direct')
        dev = {'dev': {}, 'os': {}, 'br': {}, 'app': {}}
        for t0, ua in visitors.values():
            for i, k in enumerate(('dev', 'os', 'br', 'app')):
                _add(dev[k], ua[i])
        for lg in log_only:
            for k, n in (lg.get('sources') or {}).items():
                _add(sources, k, n)
            for g in ('dev', 'os', 'br', 'app'):
                for k, n in ((lg.get('devices') or {}).get(g) or {}).items():
                    _add(dev[g], k, n)

        reach_out = {}
        for p, rs in reach.items():
            if p not in pages:
                continue
            order = list(HOME_SECS) if p == '/' else []
            order += [k for k in rs if k not in order]
            pv = pages[p]['pv']
            reach_out[p] = [{"sec": k, "n": rs.get(k, 0), "pct": round(rs.get(k, 0) / pv, 4) if pv else 0.0}
                            for k in order]

        # 입금 확인은 예매 자료 기준 (기간 안에 신청 + 지금 입금 확인 상태)
        paid = 0
        for o in (STORE.all() if STORE else []):
            if o.get('status') != 'paid':
                continue
            c = parse_iso(o.get('createdAt'))
            if c is None:
                continue
            cd = c.astimezone(KST).date()
            if (days == 'all' or cd >= first) and cd <= today:
                paid += 1
        fn = {'visit': n_v, 'ticket': len(ticket_v), 'start': len(start_v), 'ok': len(ok_v), 'paid': paid}

        live = set()
        cut = t_now.timestamp() - STATS_LIVE_SEC
        for d in (today - timedelta(days=1), today):
            ds = d.strftime('%Y%m%d')
            if ds in files:
                for r in _load_day(ds).values():
                    if r['t1'] >= cut:
                        live.add(r['v'])

        act_sum = sum(se['act'] for se in sess.values())
        bounce = sum(1 for se in sess.values() if se['n'] == 1 and se['act'] < 10000)
        return {
            "ok": True,
            "range": {"from": first.isoformat(), "to": today.isoformat()},
            "generatedAt": iso(t_now),
            "since": ('%s-%s-%s' % (since[:4], since[4:6], since[6:])) if since else None,
            "kpi": {
                "visitors": n_v,
                "newVisitors": len(new_v),
                "sessions": n_s,
                "pageviews": len(merged),
                "avgActiveSec": round(act_sum / n_s / 1000.0, 1) if n_s else 0,
                "bounceRate": round(bounce / float(n_s), 4) if n_s else 0.0,
                "liveNow": len(live),
                "ticketConv": round(len(ok_v) / float(n_v), 4) if n_v else 0.0,
            },
            "daily": daily,
            "hourly": hourly,
            "sources": _top(sources),
            "devices": dict((k, _top(c)) for k, c in dev.items()),
            "logDays": len(log_only),
            "pages": [{"p": p, "pv": g['pv'], "visitors": len(g['v']),
                       "avgActiveSec": round(g['act'] / g['pv'] / 1000.0, 1) if g['pv'] else 0}
                      for p, g in sorted(pages.items(), key=lambda kv: (-kv[1]['pv'], kv[0]))],
            "reach": reach_out,
            "clicks": [{"lbl": k[0], "p": k[1], "n": c[0], "visitors": len(c[1])}
                       for k, c in sorted(clicks.items(), key=lambda kv: (-kv[1][0], -len(kv[1][1]), kv[0]))[:40]],
            "songs": [{"song": k, "plays": s[0], "ends": s[1], "avgSec": round(s[2] / s[3], 1) if s[3] else 0}
                      for k, s in sorted(songs.items(), key=lambda kv: (-kv[1][0], -kv[1][1], kv[0]))],
            "funnel": [{"k": k, "label": label, "n": fn[k]} for k, label in FUNNEL],
            "perf": dict((g, dict((k, {"p50": _pctl(arr, 0.5, k), "p75": _pctl(arr, 0.75, k), "n": len(arr)})
                                  for k, arr in perf[g].items())) for g in ('m', 'd')),
            "errors": [{"msg": k[0], "src": k[1], "line": k[2], "n": e['n'], "last": e['last'], "p": e['p']}
                       for k, e in sorted(errors.items(), key=lambda kv: (-kv[1]['n'], kv[0]))[:30]],
            "shares": _top(shares),
        }


def build_heat(p, dev, days):
    """히트맵 점: [구역, x, y] 최근 것부터 최대 30000개. n 은 걸러진 전체 클릭 수."""
    today = now().date()
    with _agg_lock:
        files = _ev_days()
        lo = '00000000' if days == 'all' else (today - timedelta(days=days - 1)).strftime('%Y%m%d')
        hi = today.strftime('%Y%m%d')
        pts = []
        for ds in files:
            if ds < lo or ds > hi:
                continue
            for r in _load_day(ds).values():
                if r['p'] != p:
                    continue
                if dev == 'm' and r['ua'][0] not in ('m', 't'):
                    continue
                if dev == 'd' and r['ua'][0] != 'd':
                    continue
                pts.extend(r['clicks'])
        pts.sort(key=lambda c: c[0], reverse=True)
        return {"ok": True, "n": len(pts), "pts": [[c[2], c[3], c[4]] for c in pts[:30000]]}


_stats_cache = {}


def stats_cached(key, fn):
    """같은 질문이 15초 안에 또 오고 그 사이 파일이 그대로면 계산해 둔 것을 줍니다."""
    ev = []
    try:
        for n in os.listdir(STATS_DIR):
            if n.startswith('ev-'):
                try:
                    ev.append((n, os.path.getsize(os.path.join(STATS_DIR, n))))
                except OSError:
                    pass
    except OSError:
        pass
    try:
        db = os.path.getmtime(DB_PATH)
    except OSError:
        db = 0
    # Caddy 기록은 그림 하나 받을 때마다 바뀌므로 여기에 넣지 않습니다 (15초 늦게 반영돼도 괜찮음)
    sig = (STATS_DIR, tuple(sorted(ev)), db, now().strftime('%Y%m%d'))
    with _agg_lock:
        hit = _stats_cache.get(key)
        if hit and hit[1] == sig and time.time() - hit[0] < STATS_CACHE_SEC:
            return hit[2]
        res = fn()
        if len(_stats_cache) > 60:
            _stats_cache.clear()
        _stats_cache[key] = (time.time(), sig, res)
        return res


# ---- Caddy 접속 기록으로 과거(사이트 수집 전) 날짜별 방문자 추정 ----
# 하루 방문자 = 그날 (IP+UA) 고유 개수. 그날 관리 화면을 연 IP 와 사설/루프백 IP, 봇은 뺍니다.
# IP · UA 는 메모리에서 해시로만 잠깐 쓰고, 파일에는 날짜별 합계만 남깁니다(serverlog.json).
# Caddy 는 오래된 기록 파일을 지우므로, 한 번 셈한 지난 날짜는 serverlog.json 에서 절대 지우지 않습니다.

SERVERLOG_VER = 1
URI_RE = re.compile(rb'"uri":\s*"([^"]*)"')
TS_RE = re.compile(rb'"ts":\s*([0-9.]+)')
_caddy_files = {}                       # 파일 이름 -> 읽어 둔 날짜별 조각
_caddy_result = {'sig': None, 'days': {}}
_broken_seen = set()


def _caddy_list():
    try:
        names = os.listdir(CADDY_LOG_DIR)
    except OSError:
        return []
    out = []
    for n in names:
        if n == 'access.log' or (n.startswith('access-') and n.endswith('.log.gz')):
            try:
                st = os.stat(os.path.join(CADDY_LOG_DIR, n))
            except OSError:
                continue
            out.append((n, st.st_mtime, st.st_size))
    return sorted(out)


def _hkey(s):
    return hashlib.sha1(s.encode('utf-8', 'replace')).hexdigest()[:16]


def _private_ip(ip):
    """사설 · 루프백 IP (이 컴퓨터 · 집 안 공유기) 이거나 알아볼 수 없는 값이면 True."""
    try:
        a = ipaddress.ip_address(str(ip).split('%')[0])
    except ValueError:
        return True
    if a.version == 6 and a.ipv4_mapped:
        a = a.ipv4_mapped
    return a.is_private or a.is_loopback or a.is_link_local or a.is_unspecified or a.is_reserved or a.is_multicast


def _first(x):
    return str(x[0]) if isinstance(x, list) and x else ''


def _caddy_line(st, raw):
    """접속 기록 한 줄. 페이지 · 관리 화면 요청만 꼼꼼히 읽고 나머지(그림 · css 등)는 바로 넘깁니다."""
    if st['first'] is None:
        m = TS_RE.search(raw)
        if m:
            try:
                st['first'] = float(m.group(1))
            except ValueError:
                pass
    m = URI_RE.search(raw)
    if not m:
        return
    path = m.group(1).split(b'?', 1)[0].decode('utf-8', 'replace')
    page = LOG_PAGES.get(path)
    staff = path == STAFF_PATH or path.startswith(STAFF_PATH + '/') or path.startswith('/api/admin/')
    if page is None and not staff:
        return
    try:
        r = json.loads(raw.decode('utf-8'))
        req = r['request']
        ts = float(r['ts'])
    except Exception:
        return
    if not isinstance(req, dict):
        return
    ip = str(req.get('client_ip') or req.get('remote_ip') or '')
    day = datetime.fromtimestamp(ts, KST).strftime('%Y-%m-%d')
    part = st['days'].get(day)
    if part is None:
        part = st['days'][day] = {'vis': {}, 'staff': set()}
    if staff:                           # 그날 관리 화면을 쓴 IP = 운영진
        part['staff'].add(_hkey(ip))
        return
    if req.get('method') != 'GET' or r.get('status') not in (200, 304):
        return
    hdr = req.get('headers') if isinstance(req.get('headers'), dict) else {}
    ua = _first(hdr.get('User-Agent'))
    if _private_ip(ip) or is_bot(ua):
        return
    key = _hkey(ip + '\n' + ua)
    ent = part['vis'].get(key)
    if ent is not None:
        ent[7] += 1
        if ts >= ent[1]:
            return
    uri = str(req.get('uri') or '')
    frm = ''
    if '?' in uri:
        frm = (parse_qs(uri.split('?', 1)[1]).get('from') or [''])[0]
    info = ua_info(ua)
    src = stats_source(frm, info['app'], _first(hdr.get('Referer')))
    row = [_hkey(ip), ts, src, info['dev'], info['os'], info['br'], info['app']]
    if ent is None:
        part['vis'][key] = row + [1]
    else:
        ent[0:7] = row


def _caddy_scan(name, mt, size):
    """기록 파일 하나를 읽어 둡니다. 다시 읽어야 하면 False (막 압축 중인 파일 등)."""
    fp = os.path.join(CADDY_LOG_DIR, name)
    st = _caddy_files.get(fp)
    if name.endswith('.gz'):
        if st is not None and st['sig'] == (mt, size):
            return True                 # 압축된 지난 기록은 바뀌지 않습니다
        st = {'sig': (mt, size), 'first': None, 'days': {}}
        try:
            with gzip.open(fp, 'rb') as f:
                for raw in f:
                    _caddy_line(st, raw)
        except (OSError, EOFError, zlib.error) as e:
            if time.time() - mt < 300:  # 지금 만들어지는 중이면 나중에 다시
                return False
            stats_warn('gz' + name, '!! 접속 기록 %s 이 깨져 읽은 데까지만 셉니다: %s' % (name, e))
        _caddy_files[fp] = st
        return True
    # access.log: Caddy 가 계속 덧붙이는 파일이라 지난번에 읽은 곳부터 이어 읽습니다.
    # (파일을 오래 붙잡고 있으면 Caddy 가 기록을 넘기지 못하니 읽기만 빨리 하고 바로 닫습니다)
    with open(fp, 'rb') as f:
        if st is not None and (size < st['off'] or f.read(len(st['head'])) != st['head']):
            st = None                   # 새 파일로 바뀌었습니다
        if st is None:
            f.seek(0)
            st = {'sig': None, 'off': 0, 'head': f.read(256), 'first': None, 'days': {}}
        f.seek(st['off'])
        chunk = f.read(max(0, size - st['off']))
    end = chunk.rfind(b'\n')
    if end >= 0:
        for raw in chunk[:end].split(b'\n'):
            _caddy_line(st, raw)
        st['off'] += end + 1
    _caddy_files[fp] = st
    return True


def _caddy_summary(part):
    vis = [e for e in part['vis'].values() if e[0] not in part['staff']]

    def count(i):
        c = {}
        for e in vis:
            _add(c, e[i])
        return c
    return {"visitors": len(vis), "pageviews": sum(e[7] for e in vis), "sources": count(2),
            "devices": {"dev": count(3), "os": count(4), "br": count(5), "app": count(6)}}


def _serverlog_path():
    return os.path.join(STATS_DIR, 'serverlog.json')


def _serverlog_read():
    """보관된 날짜별 합계. 파일이 없으면 {}, 깨졌으면 옆에 복사해 두고 None."""
    fp = _serverlog_path()
    if not os.path.exists(fp):
        return {}
    try:
        with io.open(fp, encoding='utf-8') as f:
            doc = json.load(f)
        if not isinstance(doc, dict) or not isinstance(doc.get('days'), dict):
            raise ValueError('형식이 다릅니다')
        return doc['days']
    except Exception as e:
        try:
            mark = (fp, os.path.getmtime(fp))
        except OSError:
            mark = (fp, 0)
        if mark not in _broken_seen:    # 깨진 파일은 한 번만 옆에 복사해 둡니다
            _broken_seen.add(mark)
            broken = fp + '.broken-%s' % now().strftime('%Y%m%d-%H%M%S')
            try:
                shutil.copy2(fp, broken)
            except Exception:
                broken = '(복사 실패)'
            log('!! serverlog.json 을 읽지 못했습니다 (%s). 깨진 파일은 %s' % (e, broken))
        return None


def log_days():
    """Caddy 접속 기록으로 셈한 날짜별 {visitors, pageviews, sources, devices}. 키는 'YYYY-MM-DD'.

    지난 날짜는 serverlog.json 에 합쳐 영구 보관하고, 오늘은 매번 새로 셉니다.
    기록 파일이 그대로면 셈해 둔 것을 그대로 줍니다.
    """
    with _caddy_lock:
        files = _caddy_list()
        today = now().strftime('%Y-%m-%d')
        sig = (CADDY_LOG_DIR, STATS_DIR, today, tuple(files))
        if _caddy_result['sig'] == sig:
            return _caddy_result['days']
        ok = True
        for name, mt, size in files:
            try:
                if not _caddy_scan(name, mt, size):
                    ok = False
            except Exception as e:
                ok = False
                stats_warn('scan' + name, '!! 접속 기록 %s 을 읽지 못했습니다: %s' % (name, e))
        keep = set(os.path.join(CADDY_LOG_DIR, f[0]) for f in files)
        for fp in list(_caddy_files):   # 지워진 파일 · 다른 폴더의 것은 잊습니다
            if fp not in keep:
                del _caddy_files[fp]
        # 여러 파일에 걸친 날은 합칩니다
        parts = {}
        first = None
        for st in _caddy_files.values():
            if st['first'] is not None:
                first = st['first'] if first is None else min(first, st['first'])
            for d, part in st['days'].items():
                acc = parts.get(d)
                if acc is None:
                    acc = parts[d] = {'vis': {}, 'staff': set()}
                acc['staff'] |= part['staff']
                for k, e in part['vis'].items():
                    have = acc['vis'].get(k)
                    if have is None:
                        acc['vis'][k] = list(e)
                    else:
                        if e[1] < have[1]:
                            have[0:7] = e[0:7]
                        have[7] += e[7]
        fresh = dict((d, _caddy_summary(part)) for d, part in parts.items())
        if first is not None:           # 기록이 있는 기간인데 아무도 안 온 날은 0 명
            d = datetime.fromtimestamp(first, KST).date()
            end = now().date()
            while d <= end:
                fresh.setdefault(d.isoformat(), _caddy_summary({'vis': {}, 'staff': set()}))
                d += timedelta(days=1)
        saved = _serverlog_read()
        changed = saved is None         # 깨진 파일은 (사본을 남겼으니) 바로 새로 씁니다
        if saved is None:
            saved = {}
        if ok:
            for d, agg in fresh.items():
                if d >= today:
                    continue
                start = datetime.strptime(d, '%Y-%m-%d').replace(tzinfo=KST).timestamp()
                full = first is not None and first <= start     # 그날 기록이 처음부터 다 남아 있음
                old = saved.get(d)
                if old is None or full or agg['pageviews'] >= int((old or {}).get('pageviews') or 0):
                    if old != agg:
                        saved[d] = agg
                        changed = True
            if changed:
                try:
                    os.makedirs(STATS_DIR, exist_ok=True)
                    save_json(_serverlog_path(), {
                        "ver": SERVERLOG_VER, "updatedAt": iso(now()),
                        "about": "Caddy 접속 기록으로 셈한 날짜별 방문자 합계 (IP·UA 는 없음). 지난 날짜는 지우지 마세요.",
                        "days": dict(sorted(saved.items()))})
                except Exception as e:
                    stats_warn('serverlog', '!! serverlog.json 을 쓰지 못했습니다: %s' % e)
        out = dict(saved)
        for d, agg in fresh.items():
            if d >= today or d not in out:
                out[d] = agg
        if ok:
            _caddy_result['sig'] = sig
            _caddy_result['days'] = out
        return out


def stats_background():
    """서버가 켜진 뒤, 그리고 한 시간마다 접속 기록을 셈해 둡니다 (Caddy 가 옛 기록을 지우기 전에)."""
    time.sleep(20)
    while True:
        try:
            log_days()
        except Exception as e:
            stats_warn('bg', '!! 접속 기록 셈 실패: %s' % e)
        time.sleep(3600)


# ---------------------------------------------------------------- 셋리스트 '기대돼요'
# 곡마다 하트 하나. 한 사람(사이트가 만든 익명 번호)이 한 곡에 한 번만 셉니다.
# 같은 곡이 여러 부에 있어도 한 곡입니다. 익명 번호도 그대로 적지 않고 비밀 열쇠로 섞은 짧은 값만 둡니다.

LIKE_ID = re.compile(r'^[A-Za-z0-9_-]{8,40}$')
like_guard = Throttle(120, 600)     # 같은 곳에서 10분에 120번까지 (누르기 · 취소 합쳐서)
_like_lock = threading.Lock()
_likes = None                       # {곡 열쇠: set(섞은 번호)}
_setlist_cache = {'mt': None, 'titles': []}


def like_key(title):
    """곡을 알아보는 열쇠. 사이트(js/setlist.js)처럼 띄어쓰기·대소문자·문장부호는 따지지 않습니다."""
    s = unicodedata.normalize('NFC', str(title or '')).lower()
    return re.sub(r"[\s!?.,·'\"’()\-~]", '', s)


def like_who(u):
    return hmac.new(SECRET, ('like:' + u).encode('utf-8'), hashlib.sha256).hexdigest()[:16]


def setlist_titles():
    """지금 셋리스트의 곡 제목들 (부 순서대로, 겹치는 곡은 한 번). 파일이 바뀌면 다시 읽습니다."""
    try:
        mt = os.path.getmtime(SETLIST_JSON)
    except OSError:
        return _setlist_cache['titles']
    if mt != _setlist_cache['mt']:
        try:
            with io.open(SETLIST_JSON, encoding='utf-8') as f:
                doc = json.load(f)
            seen, out = set(), []
            for st in doc.get('stages') or []:
                for sg in st.get('songs') or []:
                    t = str(sg.get('title') or '').strip()
                    if t and t not in seen:
                        seen.add(t)
                        out.append(t)
            _setlist_cache['titles'] = out
            _setlist_cache['mt'] = mt
        except Exception as e:
            log('!! setlist.json 을 읽지 못했습니다 (기대돼요): %s' % e)
    return _setlist_cache['titles']


def likes_load():
    global _likes
    if _likes is not None:
        return _likes
    _likes = {}
    if os.path.exists(LIKES_PATH):
        try:
            with io.open(LIKES_PATH, encoding='utf-8') as f:
                doc = json.load(f)
            for k, arr in (doc.get('songs') or {}).items():
                _likes[str(k)] = set(str(x) for x in (arr or []))
        except Exception as e:
            log('!! likes.json 을 읽지 못해 새로 시작합니다 (옛 파일은 따로 둠): %s' % e)
            try:
                shutil.copy2(LIKES_PATH, LIKES_PATH + '.broken-%s' % now().strftime('%Y%m%d-%H%M%S'))
            except Exception:
                pass
    return _likes


def likes_view(u):
    """셋리스트 곡별 '기대돼요' 수와, 이 사람이 누른 곡들."""
    who = like_who(u) if LIKE_ID.match(u or '') else None
    with _like_lock:
        likes = likes_load()
        counts, mine = {}, []
        for t in setlist_titles():
            s = likes.get(like_key(t)) or ()
            counts[t] = len(s)
            if who and who in s:
                mine.append(t)
    return counts, mine


def likes_set(u, title, on):
    """누르기(on=True) / 취소. 셋리스트에 없는 곡이면 None."""
    who = like_who(u)
    with _like_lock:
        if title not in setlist_titles():
            return None
        likes = likes_load()
        s = likes.setdefault(like_key(title), set())
        if (who not in s) if on else (who in s):
            if on:
                s.add(who)
            else:
                s.discard(who)
            try:
                save_json(LIKES_PATH, {"songs": {k: sorted(v) for k, v in likes.items() if v}})
            except Exception as e:
                log('!! likes.json 저장 실패: %s' % e)
        return len(s)


# ---------------------------------------------------------------- 셋리스트 조회수
# 하이라이트를 틀 때마다 방문 통계에 'song play' 가 남습니다. 이걸 곡별로 셉니다.
# 한 사람(방문 통계의 익명 번호)이 한 곡에 하루 VIEW_CAP 번까지만 셉니다. 넘어도 손님에게 알리지 않습니다.
# 운영자 기기 · 봇은 방문 통계에서 이미 빠져 있습니다. 요청마다 세지 않고 1분에 한 번만 셉니다.

VIEW_CAP = 5
VIEW_CACHE_SEC = 60
_views = {'at': 0.0, 'data': {}}
_views_lock = threading.Lock()


def views_count():
    """{곡 제목: 조회수}. _agg_lock 안에서 부릅니다."""
    titles = set(setlist_titles())
    out = {}
    for ds in _ev_days():
        per = {}
        for r in _load_day(ds).values():
            for song, a, _sec in r['songs']:
                if a == 'play' and song in titles:
                    k = (r['v'], song)
                    per[k] = per.get(k, 0) + 1
        for (_v, song), n in per.items():
            out[song] = out.get(song, 0) + min(n, VIEW_CAP)
    return out


def views_view():
    """곡별 조회수. 1분 안에 다시 물으면 세어 둔 것을 줍니다. 못 세면 지난 값(처음이면 빈 것)."""
    with _views_lock:
        if time.time() - _views['at'] < VIEW_CACHE_SEC:
            return _views['data']
        _views['at'] = time.time()          # 실패해도 1분 동안은 다시 세지 않습니다
    # 관리 화면이 통계를 크게 계산하는 중이면 기다리지 않고 지난 값을 줍니다 (기대돼요가 늦어지지 않게)
    if not _agg_lock.acquire(timeout=2):
        return _views['data']
    try:
        data = views_count()
    except Exception as e:
        log('!! 조회수를 세지 못했습니다: %s' % e)
        return _views['data']
    finally:
        _agg_lock.release()
    _views['data'] = data
    return data


# ---------------------------------------------------------------- 명예의 전당 꽃 (숨은 재미)
# 현판을 연타하면 테두리에 꽃이 한 송이 핍니다. 한 사람(익명 번호)에 한 송이, 모든 손님이 같은 꽃밭을 봅니다.
# 꽃 자리는 피운 차례(몇 번째)로 정해지므로, 섞은 번호를 차례대로 적어 둡니다.

flower_guard = Throttle(30, 600)    # 같은 곳에서 10분에 30번까지
_flower_lock = threading.Lock()
_flowers = None                     # [섞은 번호, …] 피운 차례대로
_flower_idx = {}                    # 섞은 번호 → 차례


def flower_who(u):
    return hmac.new(SECRET, ('flower:' + u).encode('utf-8'), hashlib.sha256).hexdigest()[:16]


def flowers_load():
    global _flowers, _flower_idx
    if _flowers is not None:
        return _flowers
    _flowers = []
    if os.path.exists(FLOWERS_PATH):
        try:
            with io.open(FLOWERS_PATH, encoding='utf-8') as f:
                _flowers = [str(x) for x in (json.load(f).get('order') or [])]
        except Exception as e:
            log('!! flowers.json 을 읽지 못해 새로 시작합니다 (옛 파일은 따로 둠): %s' % e)
            try:
                shutil.copy2(FLOWERS_PATH, FLOWERS_PATH + '.broken-%s' % now().strftime('%Y%m%d-%H%M%S'))
            except Exception:
                pass
            _flowers = []
    _flower_idx = {w: i for i, w in enumerate(_flowers)}
    return _flowers


def flowers_view(u):
    """지금 꽃 수와, 이 사람이 피운 꽃의 차례(없으면 None)."""
    who = flower_who(u) if LIKE_ID.match(u or '') else None
    with _flower_lock:
        fl = flowers_load()
        return len(fl), (_flower_idx.get(who) if who else None)


def flower_add(u):
    """한 송이 피우기. 이미 피웠으면 그대로. (꽃 수, 내 차례, 새로 피웠나)"""
    who = flower_who(u)
    with _flower_lock:
        fl = flowers_load()
        if who in _flower_idx:
            return len(fl), _flower_idx[who], False
        fl.append(who)
        _flower_idx[who] = len(fl) - 1
        try:
            save_json(FLOWERS_PATH, {"order": fl})
        except Exception as e:
            log('!! flowers.json 저장 실패: %s' % e)
        return len(fl), len(fl) - 1, True


# ---------------------------------------------------------------- 구매자 분석 (관리 화면)
# 실제로 표를 산 사람들이 어디서 왔고, 얼마나 보고 샀는지 묶어서 봅니다.
# 방문 통계는 익명이고 예매에는 방문 번호가 없습니다. '예매 완료' 신호와 예매를 시각 · 매수로 그때그때 맞춰 볼 뿐,
# 이어 붙인 결과는 저장하지 않고 사람별 기록도 내주지 않습니다 (묶음 숫자만). 기존 집계 코드는 건드리지 않습니다.

BUY_MIN = 3     # 이보다 적은 묶음은 자세한 숫자를 내주지 않습니다
BUY_SEGS = (('q1', '1매'), ('q2', '2매'), ('q3', '3매'), ('q4', '4매 이상'))
BUY_SRC = {'qr': '포스터 QR', 'insta': '인스타그램', 'kakao': '카카오톡', 'everytime': '에브리타임', 'naver': '네이버',
           'google': '구글', 'youtube': '유튜브', 'fb': '페이스북', 'band': '밴드', 'other': '다른 사이트',
           'direct': '직접 입력·알 수 없음'}
BUY_LAG = ((600, 'fast', '10분 안에 바로'), (3600, 'hour', '1시간 안에'), (86400, 'day', '하루 안에'),
           (3 * 86400, 'days', '1~3일 뒤에'), (None, 'later', '3일 이상 뒤에'))
BUY_PART = ((6, 'dawn', '새벽 (0~6시)'), (12, 'morning', '오전 (6~12시)'), (18, 'noon', '오후 (12~18시)'), (24, 'night', '저녁 (18~24시)'))


def _buy_med(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2.0


def _buy_ratio(a, b):
    return round(float(a) / b, 4) if b else 0


def _buy_dur(sec):
    """사람이 읽는 시간 (인사이트 문장용. 화면의 bsDur 과 같은 모양)"""
    sec = int(round(sec or 0))
    if sec < 60:
        return '%d초' % sec
    if sec < 3600:
        return '%d분' % (sec // 60) + (' %d초' % (sec % 60) if sec % 60 else '')
    if sec < 86400:
        return '%d시간' % round(sec / 3600.0)
    return '%d일' % round(sec / 86400.0)


def _buy_src_name(k):
    k = str(k or 'direct')
    return '링크: ' + k[5:] if k.startswith('from:') else BUY_SRC.get(k, k)


def _buy_oks():
    """통계 파일에서 '예매 완료' 신호만 뽑습니다. _agg_lock 안에서 부릅니다."""
    out = []
    for ds in _ev_days():
        try:
            f = open(os.path.join(STATS_DIR, 'ev-%s.jsonl' % ds), 'rb')
        except OSError:
            continue
        with f:
            for raw in f:
                if b'"ok"' not in raw:
                    continue
                try:
                    b = json.loads(raw.decode('utf-8'))
                    at = parse_iso(b.get('at'))
                    if at is None or not isinstance(b.get('v'), str):
                        continue
                    for e in b.get('q') or []:
                        if isinstance(e, dict) and e.get('t') == 'tk' and e.get('a') == 'ok' and _num(e.get('qty')):
                            ms = _num(e.get('ms'))
                            out.append({'at': at.timestamp(), 'ms': ms / 1000.0 if ms else None, 'qty': int(_num(e.get('qty'))),
                                        'v': b['v'], 's': b.get('s'), 'pid': b.get('pid')})
                except Exception:
                    continue
    return out


def _buy_match(oks, orders):
    """신호와 예매를 잇습니다: 매수가 같고 시각이 가까운 것끼리, 가까운 짝부터. {예매 번째: 신호}"""
    pairs = []
    for i, ok in enumerate(oks):
        for j, o in enumerate(orders):
            if o['qty'] != ok['qty']:
                continue
            by_ms = abs(ok['ms'] - o['t']) if ok['ms'] else None
            by_at = abs(ok['at'] - o['t'])
            if (by_ms is not None and by_ms <= 20) or by_at <= 60:
                pairs.append((by_ms if by_ms is not None and by_ms <= 20 else by_at, i, j))
    pairs.sort(key=lambda x: x[0])
    used_i, out = set(), {}
    for _g, i, j in pairs:
        if i not in used_i and j not in out:
            used_i.add(i)
            out[j] = oks[i]
    return out


def _buy_person(pvs, t_cut=None, at_pv=None):
    """한 사람(방문 번호)의 행동. t_cut 이 있으면 그 시각까지(구매 전)만 셉니다.
    기록 시각은 서버에 도착한 시각이라, 구매가 일어난 페이지(at_pv)가 조금 늦게 찍혀도 빠뜨리지 않습니다."""
    use = [r for r in pvs if t_cut is None or r['t0'] <= t_cut or r is at_pv]
    played, liked, setlist = set(), False, False
    for r in use:
        for song, a, _sec in r['songs']:
            if a == 'play':
                played.add(song)
        if not liked and any(str(c[1]).startswith('like:') for c in r['clicks']):
            liked = True
        if 'setlist' in r['secs']:
            setlist = True
    return {'act': sum(r['act'] for r in use) / 1000.0, 'visits': len(set(r['s'] for r in use)),
            'played': played, 'liked': liked, 'setlist': setlist}


def _buy_seg(bs, total_tickets, titles):
    """묶음 하나의 숫자. 아무도 없으면 n = 0."""
    n = len(bs)
    t = sum(b['tickets'] for b in bs)
    src, dev, osn, app, songs, days = {}, {}, {}, {}, {}, {}
    lag = dict((k, 0) for _x, k, _l in BUY_LAG)
    part = dict((k, 0) for _x, k, _l in BUY_PART)
    for b in bs:
        _add(src, b['src'])
        _add(dev, b['ua'][0])
        _add(osn, b['ua'][1])
        _add(app, b['ua'][3])
        for s in b['played']:
            if s in titles:
                _add(songs, s)
        _add(days, b['day'])
        for lim, k, _l in BUY_LAG:
            if lim is None or b['lag'] < lim:
                lag[k] += 1
                break
        for lim, k, _l in BUY_PART:
            if b['hour'] < lim:
                part[k] += 1
                break
    back = [b['lag'] for b in bs if b['visits'] > 1]
    return {
        'n': n, 'tickets': t, 'share': _buy_ratio(t, total_tickets), 'entered': sum(b['entered'] for b in bs),
        'avgTickets': round(float(t) / n, 2) if n else 0,
        'medAct': _buy_med([b['act'] for b in bs]),
        'avgVisits': round(sum(b['visits'] for b in bs) / float(n), 2) if n else 0,
        'firstPct': _buy_ratio(sum(1 for b in bs if b['visits'] == 1), n),
        'medLag': _buy_med([b['lag'] for b in bs]),
        'medLagBack': _buy_med(back),
        'afterPct': _buy_ratio(sum(1 for b in bs if b['after'] > 0), n),
        'playedPct': _buy_ratio(sum(1 for b in bs if b['played']), n),
        'avgPlayed': round(sum(len(b['played']) for b in bs) / float(n), 1) if n else 0,
        'likedPct': _buy_ratio(sum(1 for b in bs if b['liked']), n),
        'setlistPct': _buy_ratio(sum(1 for b in bs if b['setlist']), n),
        'phonePct': _buy_ratio(sum(1 for b in bs if b['ua'][0] == 'm'), n),
        'src': _top(src), 'dev': _top(dev), 'os': _top(osn), 'app': _top(app),
        'songs': _top(songs)[:8],
        'lag': [{'k': l, 'n': lag[k]} for _x, k, l in BUY_LAG],
        'parts': [{'k': l, 'n': part[k]} for _x, k, l in BUY_PART],
        'days': [{'k': k, 'n': days[k]} for k in sorted(days)],
    }


def _buy_insights(d):
    """눈에 띄는 것을 문장으로. 표본이 적으면 말하지 않습니다."""
    out = []
    a, f = d['segs']['all'], d['funnel']
    visitors = f[0]['n'] if f else 0
    none = d['compare']['none']
    if a['n']:
        out.append('사이트에 온 %d명 중 %d명(%d%%)이 실제로 샀고, 한 사람이 평균 %.1f매 샀습니다.'
                   % (visitors, a['n'], round(_buy_ratio(a['n'], visitors) * 100), a['avgTickets']))
    rows = [s for s in d['sources'] if s['visitors'] >= 10 and s['buyers'] >= 3 and s['k'] != 'direct']
    if rows and visitors:
        top = max(rows, key=lambda s: s['rate'])
        out.append('%s에서 온 사람이 가장 잘 샀습니다: %d명 중 %d명, %d%% (전체 평균 %d%%).'
                   % (_buy_src_name(top['k']), top['visitors'], top['buyers'], round(top['rate'] * 100), round(_buy_ratio(a['n'], visitors) * 100)))
    tk = [s for s in d['sources'] if s['tickets']]
    if tk and a['tickets']:
        top = max(tk, key=lambda s: s['tickets'])
        out.append('티켓을 가장 많이 가져온 경로는 %s입니다: %d매, 전체의 %d%%.'
                   % (_buy_src_name(top['k']), top['tickets'], round(_buy_ratio(top['tickets'], a['tickets']) * 100)))
    if a['n'] >= 5 and none['n'] >= 5 and a['medAct'] and none['medAct']:
        out.append('구매자는 구매 전까지 보통 %s 머물렀습니다. 안 산 방문자는 보통 %s입니다.' % (_buy_dur(a['medAct']), _buy_dur(none['medAct'])))
    if a['n'] >= 5 and none['n'] >= 5:
        out.append('구매 전에 하이라이트를 1곡 이상 들은 구매자는 %d%%이고, 안 산 방문자 중 들은 사람은 %d%%입니다.'
                   % (round(a['playedPct'] * 100), round(none['playedPct'] * 100)))
    if a['n'] >= 5:
        s = '구매자의 %d%%는 첫 방문 때 바로 샀습니다.' % round(a['firstPct'] * 100)
        if a['medLagBack'] is not None and a['firstPct'] < 0.95:
            s += ' 나머지는 첫 방문 뒤 보통 %s 지나 돌아와 샀습니다.' % _buy_dur(a['medLagBack'])
        out.append(s)
    multi = [d['segs'][k] for k, _l in BUY_SEGS[1:]]
    m_n, m_t = sum(s['n'] for s in multi), sum(s['tickets'] for s in multi)
    if a['n'] >= 5 and m_n:
        out.append('2매 이상 산 %d명(구매자의 %d%%)이 티켓의 %d%%를 샀습니다.'
                   % (m_n, round(_buy_ratio(m_n, a['n']) * 100), round(_buy_ratio(m_t, a['tickets']) * 100)))
    steps = [(f[i], f[i + 1]) for i in range(len(f) - 1) if f[i]['n'] >= 10]
    if steps:
        x, y = min(steps, key=lambda p: _buy_ratio(p[1]['n'], p[0]['n']))
        out.append('가장 많이 빠지는 곳은 \'%s → %s\'입니다: %d명 중 %d명(%d%%)만 넘어갑니다.'
                   % (x['label'], y['label'], x['n'], y['n'], round(_buy_ratio(y['n'], x['n']) * 100)))
    return out


def _buy_orders():
    """방문 기록과 맞춰 볼 예매들. 이름과 예매번호는 '구매자별로 보기'에서만 내보냅니다."""
    out = []
    for o in STORE.all():
        at = parse_iso(o.get('createdAt'))
        if at is not None and o.get('status') in ('paid', 'pending', 'cancelled'):
            out.append({'t': at.timestamp(), 'qty': int(o.get('qty') or 0), 'status': o.get('status'),
                        'entered': int(o.get('enteredQty') or 0), 'name': o.get('name'), 'code': o.get('code')})
    return out


def _buy_visits():
    """페이지뷰 전부와 방문 번호별 묶음. _agg_lock 안에서 부릅니다."""
    merged = {}
    for ds in _ev_days():
        for pid, r in _load_day(ds).items():
            old = merged.get(pid)
            merged[pid] = r if old is None else _merge_rec(old, r)
    by_v = {}
    for r in merged.values():
        by_v.setdefault(r['v'], []).append(r)
    return merged, by_v


def build_buyers():
    """구매자 분석 한 벌."""
    orders = _buy_orders()
    titles = set(setlist_titles())
    with _agg_lock:
        oks = _buy_oks()
        merged, by_v = _buy_visits()
        links = _buy_match(oks, orders)
        linked = {}                 # 방문 번호 → [(예매, 신호)]
        for j, ok in links.items():
            linked.setdefault(ok['v'], []).append((orders[j], ok))

        buyers, none, applied = [], [], 0
        src_v, src_b, src_t = {}, {}, {}
        n_ticket = n_start = n_ok = 0
        for v, pvs in by_v.items():
            pvs.sort(key=lambda r: r['t0'])
            first = next((r['src'] for r in pvs if r['src'] is not None), 'direct')
            _add(src_v, first)
            if any(r['p'] == '/ticket' for r in pvs):
                n_ticket += 1
            if any('start' in r['tk'] for r in pvs):
                n_start += 1
            if v in linked or any('ok' in r['tk'] for r in pvs):
                n_ok += 1
            mine = linked.get(v) or []
            paid = [x for x in mine if x[0]['status'] == 'paid']
            if not paid:
                if mine or any('ok' in r['tk'] for r in pvs):    # 신청은 했으니 '안 산 방문자'로 치지 않습니다
                    applied += 1
                else:
                    none.append(_buy_person(pvs))
                    none[-1]['ua'] = pvs[0]['ua']
                continue
            paid.sort(key=lambda x: x[0]['t'])
            t_buy = paid[0][0]['t']
            ok = paid[0][1]
            at_pv = merged.get(ok['pid'])
            who = _buy_person(pvs, t_cut=t_buy, at_pv=at_pv)
            when = datetime.fromtimestamp(t_buy, KST)
            who.update({
                'tickets': sum(x[0]['qty'] for x in paid), 'entered': sum(x[0]['entered'] for x in paid),
                'after': len(set(r['s'] for r in pvs if r['t0'] > t_buy) - set(r['s'] for r in pvs if r['t0'] <= t_buy)),
                'lag': max(0, t_buy - pvs[0]['t0']), 'src': first,
                'ua': (at_pv or pvs[-1])['ua'], 'day': when.strftime('%m/%d'), 'hour': when.hour,
            })
            buyers.append(who)
            _add(src_b, first)
            _add(src_t, first, who['tickets'])

    total = sum(b['tickets'] for b in buyers)
    groups = {'q1': [], 'q2': [], 'q3': [], 'q4': []}
    for b in buyers:
        groups['q1' if b['tickets'] == 1 else 'q2' if b['tickets'] == 2 else 'q3' if b['tickets'] == 3 else 'q4'].append(b)
    segs = {'all': _buy_seg(buyers, total, titles)}
    def hide(x):
        return {'n': x['n'], 'tickets': x['tickets'], 'share': x['share'], 'small': True}

    for k, _l in BUY_SEGS:
        x = _buy_seg(groups[k], total, titles)
        # 한두 명뿐인 묶음은 곧 그 사람의 행동이라 사람 수와 매수만 내줍니다
        segs[k] = hide(x) if 0 < x['n'] < BUY_MIN else x
    # 전체에서 나머지를 빼면 가린 숫자가 드러나므로, 가린 사람이 너무 적으면 다음으로 작은 묶음도 가립니다
    if 0 < sum(s['n'] for s in segs.values() if s.get('small')) < BUY_MIN:
        rest = [k for k, _l in BUY_SEGS if segs[k]['n'] and not segs[k].get('small')]
        if rest:
            k = min(rest, key=lambda x: segs[x]['n'])
            segs[k] = hide(segs[k])

    def cmp_row(rows):
        n = len(rows)
        return {'n': n, 'medAct': _buy_med([x['act'] for x in rows]),
                'avgVisits': round(sum(x['visits'] for x in rows) / float(n), 2) if n else 0,
                'playedPct': _buy_ratio(sum(1 for x in rows if x['played']), n),
                'likedPct': _buy_ratio(sum(1 for x in rows if x['liked']), n),
                'setlistPct': _buy_ratio(sum(1 for x in rows if x['setlist']), n),
                'phonePct': _buy_ratio(sum(1 for x in rows if x['ua'][0] == 'm'), n)}

    paid_orders = [o for o in orders if o['status'] == 'paid']
    linked_paid = sum(1 for j in links if orders[j]['status'] == 'paid')
    # 구매자가 한두 명인 경로는 티켓 수를 내주지 않습니다 (경로와 매수로 사람을 짐작할 수 있어서)
    sources = [{'k': k, 'visitors': src_v[k], 'buyers': src_b.get(k, 0),
                'tickets': None if 0 < src_b.get(k, 0) < BUY_MIN else src_t.get(k, 0),
                'rate': _buy_ratio(src_b.get(k, 0), src_v[k])} for k in src_v]
    sources.sort(key=lambda s: (-s['buyers'], -s['visitors'], s['k']))
    d = {
        'ok': True, 'at': iso(now()),
        'link': {'paidOrders': len(paid_orders), 'linkedPaid': linked_paid, 'paidQty': sum(o['qty'] for o in paid_orders),
                 'buyers': len(buyers), 'tickets': total, 'applied': applied},
        'segNames': [{'k': k, 'label': l} for k, l in BUY_SEGS],
        'segs': segs, 'compare': {'buyer': cmp_row(buyers), 'none': cmp_row(none)}, 'sources': sources,
        'funnel': [{'k': 'visit', 'label': '사이트 방문', 'n': len(by_v)}, {'k': 'ticket', 'label': '티켓 페이지', 'n': n_ticket},
                   {'k': 'start', 'label': '예매 작성 시작', 'n': n_start}, {'k': 'ok', 'label': '예매 신청 완료', 'n': n_ok},
                   {'k': 'paid', 'label': '입금 확인', 'n': len(buyers)}],
    }
    d['insights'] = _buy_insights(d)
    return d


BUY_UNSURE = 10     # 초. 실제 신호와 예매의 시각 차이는 4초 안쪽이라 이 안의 다른 신호는 구분이 안 됩니다


def _buy_gap(ok, t):
    return min(abs(ok['ms'] - t) if ok['ms'] else float('inf'), abs(ok['at'] - t))


def build_people():
    """입금 확인된 예매를 한 줄씩 ('구매자별로 보기'). 2026-11-05 사용자 결정으로, 사이트 안내를 고친 뒤 켰습니다.
    방문 기록과의 연결은 시각 · 매수로 맞춘 추정이고 저장하지 않습니다. 들은 곡처럼 취향이 드러나는 기록은 넣지 않습니다."""
    orders = _buy_orders()
    rows = []
    with _agg_lock:
        oks = _buy_oks()
        merged, by_v = _buy_visits()
        links = _buy_match(oks, orders)
        for j, o in enumerate(orders):
            if o['status'] != 'paid':
                continue
            row = {'name': o['name'], 'code': o['code'], 'qty': o['qty'], 'entered': o['entered'],
                   't': o['t'], 'at': iso(datetime.fromtimestamp(o['t'], KST)), 'linked': False}
            ok = links.get(j)
            pvs = sorted(by_v.get(ok['v']) or [], key=lambda r: r['t0']) if ok else []
            # 같은 매수 신호가 다른 방문자에게 몇 초 안에 또 있으면 누구 기록인지 가릴 수 없습니다.
            # 남의 기록이 이름에 붙지 않도록 이런 줄은 비워 둡니다.
            if pvs and any(x['v'] != ok['v'] and x['qty'] == o['qty'] and _buy_gap(x, o['t']) <= BUY_UNSURE for x in oks):
                row['unsure'] = True
            elif pvs:
                at_pv = merged.get(ok['pid'])
                who = _buy_person(pvs, t_cut=o['t'], at_pv=at_pv)
                sess = [r['src'] for r in pvs if r['s'] == ok['s'] and r['src'] is not None]
                ua = (at_pv or pvs[-1])['ua']
                row.update({
                    'linked': True, 'first': next((r['src'] for r in pvs if r['src'] is not None), 'direct'),
                    'buy': sess[0] if sess else 'direct', 'dev': ua[0], 'os': ua[1], 'app': ua[3],
                    'visits': who['visits'], 'act': who['act'], 'lag': max(0, o['t'] - pvs[0]['t0']),
                })
            rows.append(row)
    rows.sort(key=lambda r: r['t'])
    return {'ok': True, 'at': iso(now()), 'rows': rows}


# ---------------------------------------------------------------- 가챠 추첨 (공연 중)
# 입구에서 티켓에 적어 준 번호를 손님이 티켓 페이지에 넣고, 관리자가 누르면 번호들이 꺼지다가 하나가 남습니다.
# 서버가 탈락 순서와 시작 시각을 정하고, 화면들은 서버 시계에 맞춰 같은 순서로 돌립니다.
# 번호와 이 게임용 임의 기기 번호만 저장하고, 이름 · 예매 · IP 와 잇지 않습니다.
GACHA_LEAD_MS = 6000            # 버튼을 누른 뒤 모든 화면이 받아 갈 시간
GACHA_NUM = re.compile(r'^\d{1,4}$')
GACHA_ID = re.compile(r'^[A-Za-z0-9_-]{8,40}$')
gacha_guard = Throttle(limit=300, window=600)   # 공연장에서는 한 IP 를 여럿이 나눠 쓸 수 있어 넉넉히
_gacha_lock = threading.Lock()
_gacha_doc = None


def _now_ms():
    return int(time.time() * 1000)


def gacha_is_open():
    a, b = parse_iso(CONFIG['gachaOpenAt']), parse_iso(CONFIG['gachaCloseAt'])
    return bool(a and b and a <= now() <= b)


def gacha_doc():
    """저장해 둔 추첨 기록. _gacha_lock 안에서 부릅니다."""
    global _gacha_doc
    if _gacha_doc is None:
        doc = {"entries": {}, "draws": []}
        if os.path.exists(GACHA_PATH):
            try:
                with io.open(GACHA_PATH, encoding='utf-8') as f:
                    got = json.load(f)
                if not (isinstance(got.get('entries'), dict) and isinstance(got.get('draws'), list)):
                    raise ValueError('모양이 다릅니다')
                doc = got
            except Exception as e:
                log('!! gacha.json 을 읽지 못해 새로 시작합니다 (옛 파일은 따로 둠): %s' % e)
                try:
                    os.replace(GACHA_PATH, GACHA_PATH + '.broken')
                except OSError:
                    pass
        _gacha_doc = doc
    return _gacha_doc


def gacha_save(doc):
    """저장에 실패해도 추첨은 계속 돌아가게 둡니다. _gacha_lock 안에서 부릅니다."""
    try:
        save_json(GACHA_PATH, doc)
    except Exception as e:
        log('!! gacha.json 저장 실패: %s' % e)


def gacha_steps(n):
    """탈락 시간표. ([[시작 뒤 ms, 꺼질 개수], ...], 끝나는 ms). 많을 땐 뭉텅이로 빠르게, 끝으로 갈수록 천천히."""
    steps, t, left = [], 800, n
    while left > 1:
        take = min(12 if left > 72 else 6 if left > 24 else 3 if left > 10 else 1, left - 1)
        steps.append([t, take])
        left -= take
        t += 340 if left > 24 else 460 if left > 10 else 620 if left > 4 else 1000 if left > 2 else 2200 if left == 2 else 450
    return steps, t


def gacha_ranges(v):
    """[[a, b], ...] 최대 3개. 비어 있으면 전부에서 뽑습니다. 잘못되면 None."""
    if v is None or v == []:
        return []
    if not isinstance(v, list) or len(v) > 3:
        return None
    out = []
    for r in v:
        if not (isinstance(r, list) and len(r) == 2):
            return None
        a, b = _num(r[0]), _num(r[1])
        if a is None or b is None or a != int(a) or b != int(b) or a > b:
            return None
        out.append([int(a), int(b)])
    return out


def gacha_view(board, admin, who):
    """누구에게나 주는 상태. board 는 큰 화면(번호 목록까지), who 는 이 기기가 넣은 번호를 찾을 때 씁니다."""
    t = _now_ms()
    with _gacha_lock:
        doc = gacha_doc()
        draws = doc['draws']
        cur = draws[-1] if draws else None
        live = None
        if cur and not cur.get('void') and t < cur['startAt'] + cur['dur'] + 3000:
            live = {k: cur[k] for k in ('no', 'startAt', 'order', 'steps', 'dur')}
        out = {
            'ok': True, 'now': t, 'open': gacha_is_open(), 'admin': admin,
            'openAt': CONFIG['gachaOpenAt'], 'closeAt': CONFIG['gachaCloseAt'],
            'count': len(doc['entries']), 'live': live,
            # 끝난 회차만 넣습니다. 도는 중인 회차는 order 맨 끝이 당첨이라 몇 초 먼저 들여다볼 수는 있지만
            # 순서는 이미 정해졌고 티켓 실물을 확인하므로 결과를 바꿀 수는 없습니다.
            'winners': [{'no': d['no'], 'n': d['winner'], 'void': bool(d.get('void'))}
                        for d in draws if t >= d['startAt'] + d['dur']],
        }
        if who and GACHA_ID.match(who):
            out['mine'] = next((int(k) for k, ids in doc['entries'].items() if who in ids), None)
        if board:
            out['numbers'] = sorted(int(k) for k in doc['entries'])
    return out


# ---------------------------------------------------------------- 요청 처리

class Handler(BaseHTTPRequestHandler):
    server_version = 'IF/1.0'
    sys_version = ''
    protocol_version = 'HTTP/1.1'

    # 기본 로그는 너무 시끄러워서 줄입니다
    def log_message(self, fmt, *args):
        pass

    # Caddy 가 놀고 있는 연결을 끊을 때마다 긴 오류 문구가 로그를 채웁니다.
    # 정상적인 일이라 조용히 넘깁니다.
    def handle_one_request(self):
        try:
            BaseHTTPRequestHandler.handle_one_request(self)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.close_connection = True

    def log_error(self, fmt, *args):
        pass

    # ---- 도우미 ----
    def send_json(self, obj, status=200, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text, status=200, ctype='text/plain; charset=utf-8', extra=None):
        body = text.encode('utf-8') if isinstance(text, str) else text
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_empty(self, status=204):
        """본문 없는 응답 (통계 신호에 대한 '받았어요')."""
        self.send_response(status)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def fail(self, message, status=400, code=None):
        self.send_json({"ok": False, "error": message, "code": code}, status)

    def read_body(self):
        """POST 본문을 무조건 끝까지 읽어 둡니다.

        한 연결로 여러 요청이 오가는데(HTTP/1.1 keep-alive), 본문을 남겨두면
        다음 요청을 그 찌꺼기부터 읽게 되어 엉뚱한 응답(501)이 나갑니다.
        그래서 '읽을지 말지'를 판단하기 전에 먼저 다 읽습니다.
        """
        if self.headers.get('Transfer-Encoding'):
            # 토막내어 보내는 방식은 쓰지 않습니다. 안전하게 연결을 닫습니다.
            self.close_connection = True
            return b''
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        if n <= 0:
            return b''
        if n > 256 * 1024:
            self.close_connection = True
            return b''
        try:
            return self.rfile.read(n)
        except Exception:
            self.close_connection = True
            return b''

    def body_json(self):
        try:
            return json.loads((getattr(self, '_body', b'') or b'').decode('utf-8'))
        except Exception:
            return {}

    def client_key(self):
        fwd = self.headers.get('X-Forwarded-For') or ''
        if fwd:
            return fwd.split(',')[0].strip()
        return self.client_address[0]

    def cookies(self):
        out = {}
        for part in (self.headers.get('Cookie') or '').split(';'):
            if '=' in part:
                k, v = part.split('=', 1)
                out[k.strip()] = v.strip()
        return out

    def is_admin(self):
        return check_session(self.cookies().get('if_admin', ''))

    def need_admin(self):
        if self.is_admin():
            return True
        self.fail('관리자 로그인이 필요합니다.', 401, 'need_login')
        return False

    # ---- 라우팅 ----
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        p = u.path
        try:
            if p == '/api/status':
                return self.r_status()
            if p == '/api/gacha':
                return self.r_gacha(q)
            if p == '/api/admin/gacha':
                return self.r_admin_gacha()
            if p == '/api/ticket':
                return self.r_ticket(q.get('token', [''])[0])
            if p == '/api/admin/session':
                return self.send_json({"ok": True, "admin": self.is_admin()})
            if p == '/api/admin/orders':
                return self.r_admin_orders()
            if p == '/api/admin/export':
                return self.r_admin_export()
            if p == '/api/admin/stats':
                return self.r_admin_stats(q)
            if p == '/api/admin/heat':
                return self.r_admin_heat(q)
            if p == '/api/admin/buyers':
                return self.r_admin_buyers()
            if p == '/api/admin/buyers/people':
                return self.r_admin_people()
            if p == '/api/likes':
                return self.r_likes(q)
            if p == '/api/flowers':
                return self.r_flowers(q)
            return self.fail('없는 주소입니다.', 404)
        except Exception as e:
            log('!! GET %s : %s' % (p, e))
            return self.fail('서버에서 문제가 생겼습니다.', 500)

    def do_POST(self):
        u = urlparse(self.path)
        p = u.path
        self._body = self.read_body()   # 무엇을 하든 본문부터 비웁니다
        try:
            if p == '/api/t':
                return self.r_beacon()
            if p == '/api/like':
                return self.r_like()
            if p == '/api/flower':
                return self.r_flower()
            if p == '/api/order':
                return self.r_order()
            if p == '/api/gacha/enter':
                return self.r_gacha_enter()
            if p == '/api/admin/gacha/draw':
                return self.r_admin_gacha_draw()
            if p == '/api/admin/gacha/void':
                return self.r_admin_gacha_void()
            if p == '/api/admin/gacha/reset':
                return self.r_admin_gacha_reset()
            if p == '/api/lookup':
                return self.r_lookup()
            if p == '/api/admin/login':
                return self.r_admin_login()
            if p == '/api/admin/logout':
                return self.send_json({"ok": True}, cookie='if_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
            if p == '/api/admin/confirm':
                return self.r_admin_confirm()
            if p == '/api/admin/enter':
                return self.r_admin_enter()
            if p == '/api/admin/use':
                return self.r_admin_use()
            if p == '/api/admin/memo':
                return self.r_admin_memo()
            if p == '/api/admin/reset':
                return self.r_admin_reset()
            if p == '/api/admin/clip':
                return self.r_admin_clip()
            return self.fail('없는 주소입니다.', 404)
        except Exception as e:
            log('!! POST %s : %s' % (p, e))
            return self.fail('서버에서 문제가 생겼습니다.', 500)

    # ---- 손님용 ----
    def r_likes(self, q):
        """GET /api/likes?u=익명번호 — 셋리스트 곡별 '기대돼요' 수 (+ 이 사람이 누른 곡) + 곡별 조회수"""
        counts, mine = likes_view(q.get('u', [''])[0])
        try:
            views = views_view()
        except Exception:
            views = {}                      # 조회수가 안 돼도 기대돼요는 그대로
        self.send_json({"ok": True, "counts": counts, "mine": mine, "views": views})

    def r_like(self):
        """POST /api/like {u, song, on} — '기대돼요' 누르기 / 취소"""
        b = self.body_json()
        u = str(b.get('u') or '')
        title = str(b.get('song') or '').strip()
        on = b.get('on') is True
        if not LIKE_ID.match(u) or is_bot(self.headers.get('User-Agent') or ''):
            return self.fail('잘못된 요청입니다.', 400, 'bad_request')
        if not like_guard.hit(self.client_key()):
            return self.fail('너무 자주 눌렀어요. 잠시 뒤에 다시 눌러 주세요.', 429, 'slow')
        n = likes_set(u, title, on)
        if n is None:
            return self.fail('셋리스트에 없는 곡입니다.', 404, 'no_song')
        self.send_json({"ok": True, "song": title, "n": n, "on": on})

    def r_flowers(self, q):
        """GET /api/flowers?u=익명번호 — 명예의 전당 꽃 수 (+ 이 사람 꽃의 차례)"""
        n, mine = flowers_view(q.get('u', [''])[0])
        self.send_json({"ok": True, "n": n, "mine": mine})

    def r_flower(self):
        """POST /api/flower {u} — 한 사람에 한 송이"""
        b = self.body_json()
        u = str(b.get('u') or '')
        if not LIKE_ID.match(u) or is_bot(self.headers.get('User-Agent') or ''):
            return self.fail('잘못된 요청입니다.', 400, 'bad_request')
        if not flower_guard.hit(self.client_key()):
            return self.fail('잠시 뒤에 다시 해 주세요.', 429, 'slow')
        n, mine, new = flower_add(u)
        self.send_json({"ok": True, "n": n, "mine": mine, "new": new})

    def r_status(self):
        orders = STORE.all()
        paid = [o for o in orders if o.get('status') == 'paid']
        self.send_json({
            "ok": True,
            "presaleOpen": presale_open(),
            "presaleEndAt": CONFIG['presaleEndAt'],
            "price": CONFIG['price'],
            "doorPrice": CONFIG['doorPrice'],
            "bank": CONFIG['bank'],
            "account": CONFIG['account'],
            "holder": CONFIG['holder'],
            "soldCount": sum(o.get('qty', 0) for o in paid),
            "serverTime": iso(now()),
        })

    def r_order(self):
        if not order_guard.hit(self.client_key()):
            return self.fail('잠시 뒤에 다시 시도해 주세요.', 429, 'rate')
        if not presale_open():
            return self.fail('사전 예매는 마감되었습니다. 공연 당일 현장에서 %s원에 구매하실 수 있어요.'
                             % format(CONFIG['doorPrice'], ','), 409, 'closed')
        b = self.body_json()
        name = clean_name(b.get('name'))
        if not name:
            return self.fail('이름을 확인해 주세요. 한글·영문·숫자 12자까지 가능합니다.', 400, 'name')
        try:
            qty = int(b.get('qty'))
        except (TypeError, ValueError):
            return self.fail('매수를 확인해 주세요.', 400, 'qty')
        if qty < 1 or qty > int(CONFIG['maxQtyPerOrder']):
            return self.fail('매수는 1장부터 %d장까지 넣을 수 있어요.' % CONFIG['maxQtyPerOrder'], 400, 'qty')

        code = STORE.new_code()
        order = {
            "code": code,
            "token": secrets.token_urlsafe(18),
            "name": name,
            "qty": qty,
            "amount": qty * int(CONFIG['price']),
            "status": "pending",
            "createdAt": iso(now()),
            "paidAt": None,
            "usedQty": 0,
            "enteredQty": 0,
            "enteredAt": None,
            "memo": "",
        }
        STORE.add(order)
        log('새 예매  %s %s  %d장  %s원' % (name, code, qty, format(order['amount'], ',')))
        self.send_json({
            "ok": True,
            "ticket": public_order(order),
            "token": order['token'],
            "bank": CONFIG['bank'],
            "account": CONFIG['account'],
            "holder": CONFIG['holder'],
        })

    def r_lookup(self):
        if not lookup_guard.hit(self.client_key()):
            return self.fail('조회를 너무 많이 시도했어요. 10분 뒤에 다시 해주세요.', 429, 'rate')
        b = self.body_json()
        name = str(b.get('name') or '').strip()
        code = re.sub(r'\D', '', str(b.get('code') or ''))
        if not name or len(code) != 4:
            return self.fail('이름과 예매번호 네 자리를 넣어주세요.', 400)
        o = STORE.find(name, code)
        if not o:
            return self.fail('그런 예매를 찾지 못했어요. 이름과 번호를 다시 확인해 주세요.', 404, 'notfound')
        self.send_json({"ok": True, "token": o['token'], "ticket": public_order(o)})

    def r_ticket(self, token):
        o = STORE.by_token(token)
        if not o:
            return self.fail('티켓을 찾지 못했어요.', 404, 'notfound')
        self.send_json({
            "ok": True,
            "ticket": public_order(o, self.is_admin()),
            "admin": self.is_admin(),
            "bank": CONFIG['bank'],
            "account": CONFIG['account'],
            "holder": CONFIG['holder'],
            "serverTime": iso(now()),
        })

    # ---- 관리자용 ----
    def r_admin_login(self):
        if not login_guard.hit(self.client_key()):
            return self.fail('로그인을 너무 많이 시도했어요. 15분 뒤에 다시 해주세요.', 429, 'rate')
        pw = str(self.body_json().get('password') or '')
        want = str(CONFIG.get('adminPassword') or '')
        if not want or not hmac.compare_digest(pw, want):
            time.sleep(0.7)
            return self.fail('비밀번호가 맞지 않습니다.', 401, 'badpw')
        self.send_json({"ok": True}, cookie='if_admin=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax'
                                            % (make_session(), SESSION_HOURS * 3600))

    def r_admin_orders(self):
        if not self.need_admin():
            return
        orders = STORE.all()
        orders.sort(key=lambda o: o.get('createdAt') or '', reverse=True)
        paid = [o for o in orders if o.get('status') == 'paid']
        pending = [o for o in orders if o.get('status') == 'pending']
        self.send_json({
            "ok": True,
            "orders": [public_order(o, True) for o in orders],
            "summary": {
                "pendingCount": len(pending),
                "pendingQty": sum(o.get('qty', 0) for o in pending),
                "paidCount": len(paid),
                "paidQty": sum(o.get('qty', 0) for o in paid),
                "paidAmount": sum(o.get('amount', 0) for o in paid),
                "usedQty": sum(o.get('usedQty', 0) for o in paid),
                "enteredQty": sum(o.get('enteredQty', 0) for o in paid),
            },
            "presaleOpen": presale_open(),
            "testMode": bool(CONFIG.get('testMode')),
            "serverTime": iso(now()),
        })

    def r_admin_confirm(self):
        if not self.need_admin():
            return
        b = self.body_json()
        code = str(b.get('code') or '')
        status = str(b.get('status') or '')
        if status not in ('paid', 'pending', 'cancelled'):
            return self.fail('알 수 없는 상태입니다.', 400)
        patch = {"status": status}
        patch['paidAt'] = iso(now()) if status == 'paid' else None
        if status != 'paid':
            patch['usedQty'] = 0
            patch['enteredQty'] = 0
            patch['enteredAt'] = None
        o = STORE.update(code, patch)
        if not o:
            return self.fail('그런 예매가 없습니다.', 404)
        log('상태 변경  %s %s → %s' % (o['name'], code, status))
        self.send_json({"ok": True, "ticket": public_order(o, True)})

    def r_admin_enter(self):
        """밴드를 채웠다 / 되돌린다. 맥주와는 따로 셉니다."""
        if not self.need_admin():
            return
        b = self.body_json()
        code = str(b.get('code') or '')
        o = STORE.by_code(code)
        if not o:
            return self.fail('그런 예매가 없습니다.', 404)
        if o.get('status') != 'paid':
            return self.fail('입금 확인이 된 티켓만 입장 처리할 수 있습니다.', 409, 'notpaid')
        try:
            ent = int(b.get('enteredQty'))
        except (TypeError, ValueError):
            return self.fail('입장 인원을 확인해 주세요.', 400)
        ent = max(0, min(ent, int(o.get('qty', 0))))
        patch = {"enteredQty": ent}
        if ent > 0 and not o.get('enteredAt'):
            patch['enteredAt'] = iso(now())
        if ent == 0:
            patch['enteredAt'] = None
            # 들어오지 않은 것으로 되돌리면 맥주도 함께 되돌립니다
            patch['usedQty'] = 0
        o = STORE.update(code, patch)
        log('밴드  %s %s  %d/%d명' % (o['name'], code, ent, o.get('qty', 0)))
        self.send_json({"ok": True, "ticket": public_order(o, True)})

    def r_admin_use(self):
        if not self.need_admin():
            return
        b = self.body_json()
        code = str(b.get('code') or '')
        o = STORE.by_code(code)
        if not o:
            return self.fail('그런 예매가 없습니다.', 404)
        if o.get('status') != 'paid':
            return self.fail('입금 확인이 된 티켓만 사용할 수 있습니다.', 409, 'notpaid')
        try:
            used = int(b.get('usedQty'))
        except (TypeError, ValueError):
            return self.fail('사용 매수를 확인해 주세요.', 400)
        used = max(0, min(used, int(o.get('qty', 0))))
        patch = {"usedQty": used}
        # 맥주를 가져간 만큼은 들어온 것으로 봅니다 (문에서 바로 받아 가는 경우)
        if used > int(o.get('enteredQty', 0)):
            patch['enteredQty'] = used
        if used > 0 and not o.get('enteredAt'):
            patch['enteredAt'] = iso(now())
        if used == 0:
            patch['enteredAt'] = None
        o = STORE.update(code, patch)
        self.send_json({"ok": True, "ticket": public_order(o, True)})

    def r_admin_memo(self):
        if not self.need_admin():
            return
        b = self.body_json()
        o = STORE.update(str(b.get('code') or ''), {"memo": str(b.get('memo') or '')[:200]})
        if not o:
            return self.fail('그런 예매가 없습니다.', 404)
        self.send_json({"ok": True, "ticket": public_order(o, True)})

    def r_admin_clip(self):
        """하이라이트 편집기: 곡의 시작 · 끝 · 페이드 · 소리 크기를 audio.json 에 바로 씁니다."""
        if not self.need_admin():
            return
        b = self.body_json()
        title = str(b.get('title') or '')
        with AUDIO_LOCK:
            try:
                with io.open(AUDIO_JSON, encoding='utf-8') as f:
                    doc = json.load(f)
            except Exception as e:
                log('!! audio.json 읽기 실패: %s' % e)
                return self.fail('음원 목록(audio.json)을 읽지 못했습니다.', 500)
            clips = doc.get('clips') or {}
            c = clips.get(title)
            if not isinstance(c, dict):
                return self.fail('그런 곡이 없습니다.', 404, 'no_clip')
            dur = float(c.get('dur') or 0) or 600.0

            def num(key, lo, hi):
                v = b.get(key)
                if v is None or v == '':
                    return None
                v = float(v)
                if v != v or v < lo or v > hi:      # NaN · 범위 밖
                    raise ValueError(key)
                return round(v, 2)

            try:
                start = num('start', 0, dur)
                end = num('end', 0, dur + 0.5)
                fin = num('fadeIn', 0, 5)
                fout = num('fadeOut', 0, 10)
                gain = num('gain', 0.05, 1)
            except (TypeError, ValueError):
                return self.fail('값이 올바르지 않습니다.', 400, 'bad_value')
            s0 = start or 0.0
            e0 = end if (end and end < dur - 0.05) else dur
            if e0 - s0 < 3:
                return self.fail('시작과 끝 사이가 3초는 되어야 합니다.', 400, 'too_short')

            # 0 이거나 끝까지면 칸을 지워 기본값으로 둡니다 (페이드 0 은 '페이드 없음' 이라 그대로 적습니다)
            def put(key, v, drop):
                if v is None or drop:
                    c.pop(key, None)
                else:
                    c[key] = v
            put('start', start, not start)
            put('end', end, not end or end >= dur - 0.05)
            put('fadeIn', fin, False)
            put('fadeOut', fout, False)
            if 'gain' in b:     # gain 을 안 보내는 옛 편집 화면이면 손대지 않습니다. 1(원본)이면 칸을 지웁니다.
                put('gain', gain, gain is None or gain >= 0.995)

            try:
                os.makedirs(BACKUP_DIR, exist_ok=True)
                shutil.copy2(AUDIO_JSON, os.path.join(
                    BACKUP_DIR, 'audio-%s.json' % now().strftime('%Y%m%d-%H%M%S')))
                # 편집기는 손댈 때마다 저장하므로 사본이 쌓입니다. 최근 100개만 남깁니다.
                olds = sorted(x for x in os.listdir(BACKUP_DIR) if x.startswith('audio-'))
                for x in olds[:-100]:
                    os.remove(os.path.join(BACKUP_DIR, x))
            except Exception as e:
                log('!! audio.json 사본을 못 남김: %s' % e)
            save_json(AUDIO_JSON, doc)
        log('하이라이트 저장: %s  시작 %s · 끝 %s · 페이드 %s/%s · 크기 %s' % (
            title, c.get('start', 0), c.get('end', '끝까지'), c.get('fadeIn', '-'), c.get('fadeOut', '-'), c.get('gain', 1)))
        self.send_json({"ok": True, "title": title, "clip": c})

    # ---- 방문 통계 ----
    def r_beacon(self):
        """POST /api/t — 사이트의 방문 통계 신호. 받든 버리든 늘 204 로 바로 답합니다 (사이트에 오류가 안 뜨게)."""
        try:
            stats_collect(self)
        except Exception as e:
            stats_warn('collect', '!! 통계 신호 처리 중 문제: %s' % e)
        self.send_empty(204)

    def r_admin_stats(self, q):
        """관리 화면의 통계. ?days=1|7|30|all (1 = 오늘 0시부터)"""
        if not self.need_admin():
            return
        days = stats_days_arg(q.get('days', ['all'])[0])
        self.send_json(stats_cached(('stats', days), lambda: build_stats(days)))

    def r_admin_buyers(self):
        """구매자 분석 (묶음 숫자만. 사람별 기록은 내주지 않습니다)"""
        if not self.need_admin():
            return
        self.send_json(stats_cached(('buyers',), build_buyers))

    def r_admin_people(self):
        """구매자별로 보기 (이름이 들어갑니다. 칸을 열었을 때만 부르고 저장하지 않습니다)"""
        if not self.need_admin():
            return
        self.send_json(build_people())

    def r_gacha(self, q):
        """가챠 상태 (누구나). 번호만 있고 이름은 없습니다."""
        self.send_json(gacha_view(q.get('board', [''])[0] == '1', self.is_admin(), q.get('id', [''])[0]))

    def r_gacha_enter(self):
        """티켓에 적힌 번호 넣기. 공연 중에만 받고, 관리자로 로그인한 기기는 연습할 수 있게 언제나 받습니다."""
        if not (gacha_is_open() or self.is_admin()):
            return self.fail('지금은 참여할 수 없습니다.', 409, 'closed')
        if not gacha_guard.hit(self.client_key()):
            return self.fail('잠시 뒤에 다시 눌러 주세요.', 429, 'rate')
        b = self.body_json()
        if not isinstance(b, dict):
            b = {}
        raw = '' if b.get('n') is None else str(b.get('n')).strip()
        who = str(b.get('id') or '')
        if not GACHA_NUM.match(raw) or not GACHA_ID.match(who):
            return self.fail('티켓에 적힌 번호를 넣어 주세요.', 400, 'number')
        n = int(raw)
        with _gacha_lock:
            doc = gacha_doc()
            entries = doc['entries']
            for k in list(entries):          # 번호를 고쳐 넣으면 예전 번호에서 뺍니다
                if k != str(n) and who in entries[k]:
                    entries[k].remove(who)
                    if not entries[k]:
                        del entries[k]
            ids = entries.setdefault(str(n), [])
            if who not in ids and len(ids) < 50:
                ids.append(who)
            gacha_save(doc)
            count = len(entries)
        self.send_json({"ok": True, "n": n, "count": count})

    def r_admin_gacha(self):
        if not self.need_admin():
            return
        with _gacha_lock:
            doc = gacha_doc()
            out = {
                'ok': True, 'now': _now_ms(), 'open': gacha_is_open(),
                'openAt': CONFIG['gachaOpenAt'], 'closeAt': CONFIG['gachaCloseAt'],
                'numbers': sorted(int(k) for k in doc['entries']),
                'draws': [{'no': d['no'], 'winner': d['winner'], 'void': bool(d.get('void')), 'size': len(d['order']),
                           'startAt': d['startAt'], 'dur': d['dur']} for d in doc['draws']],
            }
        self.send_json(out)

    def r_admin_gacha_draw(self):
        if not self.need_admin():
            return
        b = self.body_json()
        ranges = gacha_ranges(b.get('ranges') if isinstance(b, dict) else None)
        if ranges is None:
            return self.fail('범위를 다시 확인해 주세요.', 400, 'ranges')
        t = _now_ms()
        with _gacha_lock:
            doc = gacha_doc()
            draws = doc['draws']
            if draws and t < draws[-1]['startAt'] + draws[-1]['dur']:
                return self.fail('추첨이 아직 돌고 있습니다.', 409, 'running')
            used = set(d['winner'] for d in draws)     # 무효가 된 번호도 다시 뽑지 않습니다
            pool = [int(k) for k in doc['entries'] if int(k) not in used
                    and (not ranges or any(lo <= int(k) <= hi for lo, hi in ranges))]
            if not pool:
                return self.fail('뽑을 번호가 없습니다. 범위와 참여 번호를 확인해 주세요.', 409, 'empty')
            secrets.SystemRandom().shuffle(pool)
            steps, dur = gacha_steps(len(pool))
            d = {'no': len(draws) + 1, 'at': t, 'startAt': t + GACHA_LEAD_MS, 'order': pool, 'steps': steps,
                 'dur': dur, 'winner': pool[-1], 'void': False, 'ranges': ranges}
            draws.append(d)
            gacha_save(doc)
        log('가챠 %d회차 시작: %d개 중 추첨' % (d['no'], len(pool)))
        self.send_json({"ok": True, "no": d['no'], "size": len(pool), "startAt": d['startAt'], "dur": dur})

    def r_admin_gacha_void(self):
        """당첨 무효 (안 나타났거나 없는 번호일 때). 그 번호는 다음 추첨에서도 뺍니다."""
        if not self.need_admin():
            return
        b = self.body_json()
        no = b.get('no') if isinstance(b, dict) else None
        t = _now_ms()
        with _gacha_lock:
            doc = gacha_doc()
            d = next((x for x in doc['draws'] if x['no'] == no), None)
            if d is None:
                return self.fail('없는 회차입니다.', 404, 'none')
            if t < d['startAt'] + d['dur']:
                return self.fail('추첨이 끝난 뒤에 눌러 주세요.', 409, 'running')
            d['void'] = True
            gacha_save(doc)
        self.send_json({"ok": True})

    def r_admin_gacha_reset(self):
        """연습 뒤 참여 번호와 당첨 기록을 비웁니다. 옛 기록은 따로 남겨 둡니다."""
        global _gacha_doc
        if not self.need_admin():
            return
        with _gacha_lock:
            doc = gacha_doc()
            if doc['draws'] and _now_ms() < doc['draws'][-1]['startAt'] + doc['draws'][-1]['dur']:
                return self.fail('추첨이 끝난 뒤에 눌러 주세요.', 409, 'running')
            if doc['entries'] or doc['draws']:
                try:
                    save_json(GACHA_PATH + '.' + now().strftime('%Y%m%d-%H%M%S') + '.bak', doc)
                except Exception as e:
                    log('!! gacha 백업 실패: %s' % e)
            _gacha_doc = {"entries": {}, "draws": []}
            gacha_save(_gacha_doc)
        self.send_json({"ok": True})

    def r_admin_heat(self, q):
        """히트맵 점. ?p=/&dev=m|d&days=…  (dev m = 폰·태블릿, d = PC, 없으면 모두)"""
        if not self.need_admin():
            return
        p = stats_path(q.get('p', ['/'])[0]) or '/'
        dev = q.get('dev', [''])[0]
        dev = dev if dev in ('m', 'd') else ''
        days = stats_days_arg(q.get('days', ['all'])[0])
        self.send_json(stats_cached(('heat', p, dev, days), lambda: build_heat(p, dev, days)))

    def r_admin_reset(self):
        """시험 자료 전부 비우기. 시험 모드에서만 됩니다."""
        if not self.need_admin():
            return
        if not CONFIG.get('testMode'):
            return self.fail('시험 모드가 꺼져 있어 비울 수 없습니다. 실제 예매를 보호하기 위한 잠금입니다.',
                             409, 'not_test_mode')
        if str(self.body_json().get('confirm') or '') != '비우기':
            return self.fail('확인 문구가 맞지 않습니다.', 400, 'confirm')
        n = STORE.clear()
        log('!! 시험 자료 비움: %d건 지움 (사본은 data/backup 에 남겼습니다)' % n)
        self.send_json({"ok": True, "removed": n})

    def r_admin_export(self):
        """공연 전날 밤에 눌러서 받아두면, 이 컴퓨터가 죽어도 종이/폰으로 확인할 수 있습니다."""
        if not self.need_admin():
            return
        orders = STORE.all()
        orders.sort(key=lambda o: (o.get('name') or ''))
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(['예매번호', '이름', '입금자명', '매수', '금액', '상태', '신청시각', '입금확인시각',
                    '밴드', '맥주', '입장시각', '메모'])
        label = {'pending': '입금대기', 'paid': '입금확인', 'cancelled': '취소'}
        for o in orders:
            w.writerow([o.get('code'), o.get('name'), deposit_name(o), o.get('qty'), o.get('amount'),
                        label.get(o.get('status'), o.get('status')), o.get('createdAt'), o.get('paidAt'),
                        o.get('enteredQty', 0), o.get('usedQty', 0), o.get('enteredAt'), o.get('memo', '')])
        # 엑셀에서 한글이 깨지지 않도록 BOM 을 붙입니다
        body = ('\ufeff' + buf.getvalue()).encode('utf-8')
        fname = 'if-tickets-%s.csv' % now().strftime('%Y%m%d-%H%M')
        self.send_text(body, ctype='text/csv; charset=utf-8',
                       extra={'Content-Disposition': 'attachment; filename="%s"' % fname})


# ---------------------------------------------------------------- 시작

def main():
    global SECRET, STORE, CONFIG, STAFF_PATH
    os.makedirs(DATA_DIR, exist_ok=True)
    CONFIG = load_config()
    STAFF_PATH = '/' + str(CONFIG.get('staffPath') or DEFAULT_CONFIG['staffPath']).strip('/')
    if not CONFIG.get('adminPassword'):
        log('관리자 비밀번호가 비어 있어 관리 화면 로그인이 막혀 있습니다. config.json 의 adminPassword 를 정하세요.')
    SECRET = get_secret()
    STORE = Store()
    # 윈도에서는 SO_REUSEADDR 이 같은 포트에 두 번 붙는 것을 허용합니다.
    # 서버가 두 개 뜨면 한 파일을 두 곳에서 고치게 되므로 반드시 막아야 합니다.
    class OneOnly(ThreadingHTTPServer):
        allow_reuse_address = False
        daemon_threads = True
        # 한꺼번에 몰려온 연결을 줄 세워 둘 자리. 기본값 5 로는 동시에 200명이 오면
        # 일부가 문 앞에서 튕겼다가(Caddy 가 다시 시도해 결국 되지만) 0.5~1초씩 늦어졌습니다.
        request_queue_size = 256

        def server_bind(self):
            # 윈도에서는 다른 프로그램이 SO_REUSEADDR 를 켜두면 같은 포트에 끼어들 수 있습니다.
            # 이 옵션으로 포트를 독점해 그런 일을 원천 차단합니다.
            if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                try:
                    self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                except OSError:
                    pass
            ThreadingHTTPServer.server_bind(self)

    try:
        srv = OneOnly((HOST, PORT), Handler)
    except OSError as e:
        log('포트 %d 를 이미 누가 쓰고 있습니다. 티켓 서버가 이미 켜져 있는 것 같아 그냥 물러납니다. (%s)' % (PORT, e))
        return
    log('I.F 티켓 서버가 http://%s:%d 에서 기다립니다.' % (HOST, PORT))
    log('예매 %d건, 사전 예매 %s' % (len(STORE.all()), '열림' if presale_open() else '마감'))
    log('방문 통계 켜짐: %s' % STATS_DIR)
    threading.Thread(target=stats_background, name='stats-log', daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log('종료합니다.')
        srv.server_close()


if __name__ == '__main__':
    main()
