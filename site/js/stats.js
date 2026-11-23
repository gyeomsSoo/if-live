// 익명 방문 통계 (약속: SPEC.md §1). 쪽이 다 뜬 뒤 util.js 의 loadStats() 가 부릅니다.
// 이름·연락처·IP 는 모릅니다. 여기서 무엇이 실패해도 사이트는 그대로여야 합니다.
const W = window, D = document, L = location, now = () => Date.now();
const AREA = 'section[id],header[id],footer[id],main[id]';
const PICK = 'a,button,[role=button],.song,.sp,.shop,label,input,summary';
const HOOK = { song: 1, tk: 1, share: 1 };
const noop = () => {};
const r3 = (x) => Math.round(x * 1000) / 1000;
const safe = (fn) => (e) => { try { fn(e); } catch (x) { /* 무시 */ } };

// 무작위 번호 (base64url). 16바이트 → 22자
function rid(n) {
  const a = new Uint8Array(n);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < n; i += 1) a[i] = Math.random() * 256; }
  return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function start() {
  let ls = null;   // 저장소를 못 쓰면 이번 쪽만 임시 번호로
  try { ls = W.localStorage; ls.setItem('if_t', '1'); ls.removeItem('if_t'); } catch (e) { ls = null; }
  const get = (k) => { try { return ls && ls.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { if (ls) ls.setItem(k, v); } catch (e) { /* 무시 */ } };

  // ?from=qr : 읽고 나서 주소에서 지웁니다 (링크를 퍼 가도 따라가지 않게)
  let src = '';
  try {
    const u = new URL(L.href);
    const f = u.searchParams.get('from');
    if (f != null) {
      src = f.replace(/[^\w-]/g, '').slice(0, 32);
      u.searchParams.delete('from');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  } catch (e) { /* 무시 */ }

  // 안 세는 경우: 운영진 기기 · 스크린샷/히트맵/진단 화면 · 자동 브라우저(시험 표시 없으면)
  if (/shot|heat|diag/.test(L.search) || get('if_stats_off') === '1' || get('if_setlist_peek') === '1'
    || (navigator.webdriver && get('if_stats_test') !== '1')) { W.IFT = noop; W.IFQ = null; return; }

  let n = 0;
  let v = get('if_vid');
  if (!/^[\w-]{22}$/.test(v || '')) { v = rid(16); n = 1; put('if_vid', v); }
  let s = '';
  try { const o = JSON.parse(get('if_sess')); if (o && now() - o.last < 18e5) s = String(o.id); } catch (e) { /* 새로 */ }
  if (!/^[\w-]{8,32}$/.test(s)) s = rid(12);
  const touch = () => put('if_sess', JSON.stringify({ id: s, last: now() }));

  const p = L.pathname.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1') || '/';
  const vis = () => D.visibilityState === 'visible';
  let pid, q, seen, dep, acc, since, lastAct, perfDone, errs;
  const act = () => acc + (since ? now() - since : 0);   // 화면이 보이던 누적 ms

  function push(t, o, ms) {
    if (q.length < 200) q.push(Object.assign({ t, ms: ms || now() }, o));
    if (q.length >= 40) flush();
  }
  // 한 페이지뷰의 묶음을 보냅니다 (16KB 넘지 않게 40개씩)
  function flush() {
    while (q.length) {
      const body = JSON.stringify({ v, s, pid, p, n, q: q.splice(0, 40) });
      let ok = false;
      try { ok = navigator.sendBeacon('/api/t', new Blob([body], { type: 'text/plain' })); } catch (e) { ok = false; }
      if (!ok) try { fetch('/api/t', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(noop); } catch (e) { /* 무시 */ }
    }
    touch();
  }

  // 얼마나 내려왔나 + 화면 세로 1/3 이상(짧은 구역은 거의 다) 처음 보인 구역
  function scan() {
    const h = W.innerHeight;
    const full = D.documentElement.scrollHeight;
    if (full > 0) dep = Math.max(dep, Math.min(1, (W.scrollY + h) / full));
    D.querySelectorAll(AREA).forEach((el) => {
      const r = el.getBoundingClientRect();
      const shown = Math.min(r.bottom, h) - Math.max(r.top, 0);
      if (!seen.has(el.id) && r.height > 0 && shown > 0 && shown >= Math.min(h / 3, r.height * 0.9)) {
        seen.add(el.id);
        push('r', { sec: el.id });
      }
    });
  }

  function hb() {
    const a = Math.round(act());
    if (a === lastAct) return;   // 숨김 → 떠남이 잇달아 와도 한 번만
    lastAct = a;
    push('hb', { act: a, dep: r3(dep) });
  }

  // 누른 것의 이름 (SPEC 의 lbl 규칙). 입력칸은 값을 절대 읽지 않습니다
  function label(t) {
    const tr = t.closest('[data-track]');
    if (tr) return tr.getAttribute('data-track').slice(0, 80);
    const el = t.closest(PICK);
    if (!el) return 'bg';
    const c = el.classList, tag = el.tagName;
    const kind = c.contains('song') ? 'song' : (c.contains('sp') || c.contains('shop')) ? 'sponsor'
      : tag === 'A' ? 'link' : tag === 'BUTTON' ? 'btn' : tag === 'INPUT' ? 'input' : 'el';
    // 곡은 제목만 (aria-label 에는 가수 · '하이라이트 듣기' 까지 붙어 순위가 지저분해집니다)
    const st = kind === 'song' && el.querySelector('.song__title');
    // 입력칸은 사람이 읽는 이름표(aria-label · 감싼 label 의 제목 · 안내 글자)로. 적힌 값은 절대 안 읽습니다
    const lb = kind === 'input' && el.labels && el.labels[0] && el.labels[0].querySelector('.fld__label');
    let txt = kind === 'input' ? el.getAttribute('aria-label') || (lb && lb.textContent) || el.placeholder || el.name || el.id
      : (st && st.textContent) || el.getAttribute('aria-label');
    if (!txt && kind !== 'input') txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${kind}:${String(txt || '').replace(/\s+/g, ' ').trim()}`.slice(0, 80);
  }

  // 문서 안 '제자리' — 스크롤 효과 · transform 으로 잠깐 움직인 위치가 아니라 배치된 자리. 고정(fixed)이면 null
  function home(el) {
    let x = 0, y = 0;
    for (let n = el; n; n = n.offsetParent) {
      if (W.getComputedStyle(n).position === 'fixed') return null;
      x += n.offsetLeft; y += n.offsetTop;
    }
    return { x, y };
  }

  function onClick(e) {
    const t = e.target;
    if (!e.isTrusted || !t || !t.closest) return;
    const box = t.closest(AREA), hb = box || D.body;
    let x = e.clientX, y = e.clientY;
    if (!e.detail) { const b = t.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }   // 키보드
    // 폰의 첫 화면은 스크롤하면 안쪽이 따로 움직여서, 화면에 보이는 위치로 재면 열 지도에서 엉뚱한 데 찍힙니다.
    // 그래서 누른 요소의 '제자리' 기준으로 잽니다 (안 되면 화면 위치로).
    let el = t;
    while (el && el.offsetParent === undefined) el = el.parentElement;   // svg 속이면 감싼 HTML 요소로
    const a = el && el !== hb ? home(el) : null, s = a && home(hb);
    let px, py, w, h;
    if (a && s) {
      const er = el.getBoundingClientRect();
      px = a.x - s.x + (x - er.left) * (er.width ? el.offsetWidth / er.width : 1);
      py = a.y - s.y + (y - er.top) * (er.height ? el.offsetHeight / er.height : 1);
      w = hb.offsetWidth; h = hb.offsetHeight;
    } else {
      const r = hb.getBoundingClientRect();
      px = x - r.left; py = y - r.top; w = r.width; h = r.height;
    }
    const k = (v, n) => (n > 0 ? r3(Math.min(1, Math.max(0, v / n))) : 0);
    push('c', { sec: box ? box.id : 'body', rx: k(px, w), ry: k(py, h), lbl: label(t), vw: W.innerWidth });
  }

  // 속도. 모르는 값은 뺍니다
  const pf = {};
  let cls = -1, win = 0, first = 0, last = 0;
  const watch = (type, fn, more) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...more }); return 1; } catch (e) { return 0; }
  };
  watch('largest-contentful-paint', (e) => { pf.lcp = e.startTime; });
  watch('paint', (e) => { if (e.name === 'first-contentful-paint') pf.fcp = e.startTime; });
  watch('event', (e) => { if (e.interactionId) pf.inp = Math.max(pf.inp || 0, e.duration); }, { durationThreshold: 16 });
  watch('first-input', (e) => { pf.inp = Math.max(pf.inp || 0, e.duration); });
  if (watch('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    if (win && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value;
    else { win = e.value; first = e.startTime; }
    last = e.startTime;
    cls = Math.max(cls, win);
  })) cls = Math.max(cls, 0);
  function perf() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.responseStart > 0) pf.ttfb = nav.responseStart - (nav.activationStart || 0);
    } catch (e) { /* 무시 */ }
    const o = {};
    ['lcp', 'fcp', 'ttfb', 'inp'].forEach((k) => { if (pf[k] >= 0 && pf[k] < 6e5) o[k] = Math.round(pf[k]); });
    if (cls >= 0) o.cls = r3(cls);
    return o;
  }

  function err(msg, file, line, ms) {
    if (errs >= 5 || !msg || msg === 'Script error.') return;
    errs += 1;
    push('err', { msg: String(msg).slice(0, 200), src: String(file || '').split(/[?#]/)[0].split('/').pop().slice(0, 80), line: Number(line) || 0 }, ms);
  }

  function leave() {
    if (since) { acc += now() - since; since = 0; }
    hb();
    if (!perfDone) {
      perfDone = true;
      const o = perf();
      if (Object.keys(o).length) push('perf', o);
    }
    flush();
  }

  // 새 페이지뷰: 처음, 그리고 뒤로 가기로 되살아났을 때
  function view(back) {
    pid = rid(9);
    q = [];
    seen = new Set();
    dep = acc = errs = 0;
    lastAct = -1;
    perfDone = back;
    since = vis() ? (back ? now() : now() - performance.now()) : 0;   // 처음엔 쪽이 열린 순간부터
    const o = { vw: W.innerWidth, vh: W.innerHeight, dpr: Math.round((W.devicePixelRatio || 1) * 100) / 100, lang: String(navigator.language || '').slice(0, 16) };
    try { if (D.referrer) { const u = new URL(D.referrer); o.ref = (u.origin + u.pathname).slice(0, 200); } } catch (e) { /* 무시 */ }
    if (src && !back) o.src = src;
    push('pv', o);
    scan();
    flush();
  }
  view(false);

  // 다른 모듈의 알림 (util.js 의 stat). 이 파일이 오기 전에 모아 둔 것부터.
  // err 는 main.js 가 잡은 고장 (자료를 못 받음 · 섹션 하나가 멈춤) — 창 오류와 같은 한도로 셉니다
  const take = (t, o, ms) => {
    o = o && typeof o === 'object' ? o : {};
    if (t === 'err') err(o.msg, o.src, o.line, ms);
    else if (HOOK[t]) push(t, o, ms);
  };
  W.IFT = (t, o) => { try { take(t, o); } catch (e) { /* 무시 */ } };
  const pre = W.IFQ;
  W.IFQ = null;
  if (Array.isArray(pre)) pre.slice(0, 30).forEach(safe((x) => take(x[0], x[1], x[2])));

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; safe(scan)(); });
  };
  const on = (t, ev, fn, o) => t.addEventListener(ev, safe(fn), o);
  on(W, 'scroll', onScroll, { passive: true });
  on(W, 'resize', onScroll, { passive: true });
  on(D, 'click', onClick, { capture: true, passive: true });
  on(D, 'visibilitychange', () => { if (!vis()) leave(); else if (!since) since = now(); });
  on(W, 'pagehide', leave);
  on(W, 'pageshow', (e) => { if (e.persisted) view(true); });
  on(W, 'error', (e) => err(e.message, e.filename, e.lineno));
  on(W, 'unhandledrejection', (e) => {
    const r = e.reason;
    const m = r && r.stack && /([^/\s()]+\.js)\S*?:(\d+)/.exec(String(r.stack));
    err((r && r.message) || String(r), m && m[1], m && m[2]);
  });
  setInterval(safe(() => { if (vis()) { scan(); hb(); flush(); } }), 30000);
}

try { start(); } catch (e) { /* 통계가 망가져도 사이트는 그대로 */ }
