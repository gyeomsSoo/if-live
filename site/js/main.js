// ============================================================
// I.F 2026 LIVE — 진입점
// data/*.json 을 읽어 화면에 채우고, 섹션 모듈을 시작합니다.
// ============================================================
import { $$, get, closeModal, loadStats, stat } from './util.js';
import { initNav } from './nav.js';
import { initHero } from './hero.js';
import { initCountdown } from './countdown.js';
import { initInfo } from './info.js';
import { initSetlist } from './setlist.js';
import { initNotice } from './notice.js';
import { initSponsors } from './sponsors.js';
import { initShare } from './share.js';
import { initMotion } from './motion.js';
import { initInteract } from './interact.js';
import { initPoster } from './poster.js';

// 이 기기가 예전에 이 사이트에 온 적이 있나 — 다른 모듈이 익명 번호를 만들기 전, 맨 처음에 재 둡니다
// (셋리스트가 바뀌었다는 안내 창은 와 본 적 있는 손님에게만 띄웁니다. js/setlist-note.js)
const BEEN_HERE = (() => {
  try { return ['if_vid', 'if_lid', 'if_sess', 'if_stats_off', 'if_setnote'].some((k) => localStorage.getItem(k) !== null); } catch { return false; }
})();

function fetchJson(name) {
  return fetch(`data/${name}.json`, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .catch((e) => { throw new Error(`${name}.json — ${e.message}`); });
}

// 자료는 index.html <head> 에서 이미 부르기 시작했습니다. 그 결과를 이어받습니다.
// 그게 실패했으면(잠깐 끊긴 연결 등) 조금 뒤 한 번 더 직접 부릅니다.
function loadJson(name) {
  const pre = window.IF_JSON && window.IF_JSON[name];
  if (!pre) return fetchJson(name);
  return pre.catch(() => new Promise((r) => setTimeout(r, 800)).then(() => fetchJson(name)));
}

// data-ev="a.b.c" 인 요소에 event.json 값을 채움
function bindEvent(ev) {
  $$('[data-ev]').forEach((el) => {
    const v = get(ev, el.dataset.ev);
    if (v != null) el.textContent = v;
  });
  $$('[data-ev-len]').forEach((el) => {
    const v = get(ev, el.dataset.evLen);
    if (Array.isArray(v)) el.textContent = v.length;
  });
  $$('[data-ev-href]').forEach((el) => {
    const v = get(ev, el.dataset.evHref);
    if (v) el.setAttribute('href', v);
  });
}

// 고장 내용은 운영자에게만 갑니다 (관리 화면 '방문 통계' → 오류). 손님 화면에는 띄우지 않습니다.
function report(what, e) {
  console.error(what, e);
  const m = e && e.stack && /([^/\s()]+\.js)\S*?:(\d+)/.exec(String(e.stack));
  stat('err', { msg: `${what}: ${(e && e.message) || e}`, src: m ? m[1] : 'main.js', line: m ? Number(m[2]) : 0 });
}

// 섹션은 하나씩 따로 켭니다. 한 곳이 고장 나도 나머지는 그대로 뜹니다.
function run(name, fn) {
  try { fn(); } catch (e) { report(`${name} 표시 실패`, e); }
}

// 손님 안내(새로고침 버튼)는 index.html <head> 의 IF_LOADFAIL 이 그립니다.
// main.js 가 아예 못 뜰 때도 같은 안내를 띄워야 해서 그쪽에 둡니다.
function showLoadFail() {
  if (typeof window.IF_LOADFAIL === 'function') window.IF_LOADFAIL();
}

// 폰 점검용: 주소에 ?env=1 을 붙이면 화면 아래에 이 기기가 브라우저에 알려 주는 값들을 띄웁니다.
// (폰에서만 어떤 연출이 안 보일 때 원인 찾기용. 주소를 붙인 사람에게만 보입니다)
if (/[?&]env=1/.test(location.search)) {
  window.addEventListener('load', () => {
    const q = (m) => (window.matchMedia(m).matches ? 'O' : 'X');
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;margin:0;padding:12px;'
      + 'background:#111;color:#5BE8F0;font:15px/1.6 monospace;white-space:pre-wrap;border:1px solid #5BE8F0';
    box.textContent = [
      `올려놓기 없음(hover:none) ${q('(hover: none)')}   손가락(pointer:coarse) ${q('(pointer: coarse)')}`,
      `마우스급(pointer:fine) ${q('(pointer: fine)')}   아무 입력이나 올려놓기(any-hover) ${q('(any-hover: hover)')}`,
      `움직임 줄이기(reduced-motion) ${q('(prefers-reduced-motion: reduce)')}`,
      `터치 점 ${navigator.maxTouchPoints} · 화면 ${window.innerWidth}×${window.innerHeight}`,
      navigator.userAgent,
    ].join('\n');
    document.body.appendChild(box);
  });
}

// 스크린샷용(?shot) · 관리 화면의 '누른 곳 지도'(?heat): 움직임 없이 모든 것이 제 모습으로
if (/shot|heat/.test(location.search)) document.documentElement.classList.add('shot');
if (location.search.includes('heat')) {
  document.documentElement.classList.add('heat');
  // 길게 늘린 iframe 에서는 '화면 가까이' 판단이 안 되어 늦게 받는 그림이 끝내 비어 있습니다. 바로 받습니다
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
}

// 섹션마다 필요한 자료. 자료가 없으면 그 섹션만 건너뛰고, 자료가 필요 없는 섹션(메뉴·움직임 등)은 늘 켭니다.
const SECTIONS = [
  ['nav', initNav, []],
  ['countdown', initCountdown, ['event']],
  ['info', initInfo, ['event']],
  ['setlist', initSetlist, ['event', 'setlist']],
  ['notice', initNotice, ['event', 'notices']],
  ['sponsors', initSponsors, ['event', 'sponsors']],
  ['share', initShare, ['event']],
  ['motion', initMotion, []],
  ['interact', initInteract, []],
  ['poster', initPoster, []],
];

async function boot() {
  const keys = ['event', 'setlist', 'sponsors', 'notices', 'audio'];
  const got = await Promise.all(keys.map((k) => loadJson(k).catch((e) => {
    report('자료 못 받음', e);
    // 하이라이트 음원 목록은 없어도 사이트는 그대로 뜹니다 (곡만 COMING SOON 으로)
    return k === 'audio' ? {} : null;
  })));
  const data = {};
  keys.forEach((k, i) => { data[k] = got[i]; });
  window.IF_DATA = data; // 디버그용
  if (keys.some((k) => !data[k])) showLoadFail();

  if (data.event) run('event', () => bindEvent(data.event));
  SECTIONS.forEach(([name, init, needs]) => {
    if (needs.every((k) => data[k])) run(name, () => init(data));
  });
  // 셋리스트가 바뀌었을 때 한 번 뜨는 안내 창 (따로 받아 씁니다. 못 받아도 사이트는 그대로)
  if (data.setlist && data.setlist.update) import('./setlist-note.js').then((m) => m.initSetNote(data, BEEN_HERE)).catch(() => {});

  // GSAP/Lenis 는 defer 스크립트라 모듈보다 늦게 올 수 있음 → 준비되면 히어로 모션 시작
  const startHero = () => run('hero', () => initHero(data));
  if (window.gsap) startHero(); else window.addEventListener('load', startHero, { once: true });

  // 모달 닫기
  $$('#modal [data-close]').forEach((b) => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  document.documentElement.classList.add('is-ready');

  // 진단: 가로로 삐져나오는 요소 찾기 (?diag=1 일 때만)
  if (location.search.includes('diag')) {
    const w = document.documentElement.clientWidth;
    const wide = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return;
      const over = Math.round(Math.max(r.right - w, -r.left));
      if (over > 1) {
        const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${Array.from(el.classList).join('.')}`;
        wide.push(`${name}[L${Math.round(r.left)} R${Math.round(r.right)} +${over}]`);
      }
    });
    const rep = [`docSW=${document.documentElement.scrollWidth}`, `bodySW=${document.body.scrollWidth}`, `cw=${w}`, `count=${wide.length}`].concat(wide.slice(0, 25));
    document.documentElement.setAttribute('data-diag', rep.join(' || '));
  }
}

boot().catch((e) => report('시작 실패', e));

// 방문 통계: 쪽이 다 뜬 뒤 한가할 때 (사이트 속도에 영향 없게)
loadStats();
