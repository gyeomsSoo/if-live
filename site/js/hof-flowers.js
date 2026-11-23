// 명예의 전당 꽃 — 숨은 재미
//   현판을 빠르게 다섯 번 누르면 테두리에 꽃이 한 송이 핍니다. 한 사람(익명 번호)에 한 송이.
//   모든 손님이 같은 꽃밭을 봅니다. 꽃의 자리 · 종류 · 크기는 '몇 번째로 피었나' 로만 정해지므로
//   누가 어느 기기로 보든 같은 꽃이 같은 자리에 있습니다. 차례는 서버(/api/flower)가 매깁니다.
//   서버가 이 기능을 모르면(예매 서버를 다시 켜기 전) 아무것도 하지 않습니다 — 현판은 그대로입니다.
//   꽃 그림은 색종이를 오려 겹쳐 붙인 느낌입니다 (assets/flowers/paper-*.svg).
//   상시 도는 고리는 없습니다. 움직임은 누를 때 반짝임 · 피어날 때 · 다시 눌렀을 때뿐이고, 한 번 돌고 사라집니다.
import { reducedMotion, toast } from './util.js';

const asset = (f) => new URL(`../assets/flowers/${f}`, import.meta.url).href;
const KINDS = [
  { src: asset('paper-rose.svg'), side: false },
  { src: asset('paper-cherry.svg'), side: false },
  { src: asset('paper-tulip.svg'), side: true },    // 옆모습 — 줄기가 테두리에 꽂혀 바깥으로 핍니다
  { src: asset('paper-daisy.svg'), side: false },
];
const FLAT = KINDS.filter((k) => !k.side);         // 아래 변에는 위에서 본 꽃만 (거꾸로 매달려 보이지 않게)
const TAPS = 5;           // 이만큼을
const SPAN = 1800;        // 이 시간(ms) 안에 누르면 핍니다
const MAX_DRAW = 240;     // 이보다 많아지면 그림은 여기까지만 그립니다 (수는 전부 셉니다)
const PAPER = ['#F49AB0', '#FFD3E0', '#FFB38A', '#8FC9A3', '#FFD45C', '#F7B3C4', '#FFFFFF'];

const ONE = '이미 한 송이를 피우셨습니다';   // 꽃은 한 분께 한 송이

// 차례(i)마다 늘 같은 값이 나오는 0~1 사이 수
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// 셋리스트 '기대돼요' 와 같은 익명 번호를 씁니다 (js/setlist.js likeId 와 같은 규칙)
function likeId() {
  const make = () => {
    const a = new Uint8Array(12);
    try { crypto.getRandomValues(a); } catch { for (let i = 0; i < a.length; i += 1) a[i] = Math.random() * 256; }
    return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  try {
    let v = localStorage.getItem('if_lid');
    if (!v || !/^[A-Za-z0-9_-]{8,40}$/.test(v)) { v = make(); localStorage.setItem('if_lid', v); }
    return v;
  } catch {
    return make();   // 저장을 못 하는 브라우저면 이번 방문만
  }
}

// 꽃 모양 규칙(css/hof-flowers.css)이 붙은 뒤에 그립니다. 못 받으면 그리지 않습니다.
let cssP = null;
function loadCss() {
  if (cssP) return cssP;
  cssP = new Promise((done) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../css/hof-flowers.css', import.meta.url).href;
    l.onload = () => done(true);
    l.onerror = () => done(false);
    document.head.append(l);
  });
  return cssP;
}

// 꽃 그림을 종류마다 한 장씩 미리 구워 둡니다 (그림자 포함).
//   SVG 를 그대로 수백 장 깔면 꽃마다 종이 조각 스무 몇 겹을 그림자째 매번 다시 그려서,
//   느린 폰에서는 현판을 지나갈 때 눈에 띄게 무거워졌습니다. 구운 그림 한 장을 돌려 쓰면 가볍습니다.
//   굽지 못하는 브라우저면 SVG 를 그대로 씁니다 (그림자는 css 로).
const BAKE = 96;   // 꽃 한 송이가 가장 클 때의 크기(css px). 이 크기 × 화면 배율로 굽습니다
let bakeP = null;
function bakeAll() {
  if (bakeP) return bakeP;
  const px = Math.round(BAKE * Math.min(3, Math.max(1, window.devicePixelRatio || 1)));
  bakeP = Promise.all(KINDS.map(async (k) => {
    try {
      const im = new Image();
      im.src = k.src;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = px;
      c.height = px;
      const g = c.getContext('2d');
      g.shadowColor = 'rgba(0,0,0,.6)';
      g.shadowOffsetY = px * 0.028;
      g.shadowBlur = px * 0.028;
      g.drawImage(im, 0, 0, px, px);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
      if (blob) k.img = URL.createObjectURL(blob);
    } catch { /* SVG 그대로 */ }
  }));
  return bakeP;
}

// 한 번 돌고 사라지는 움직임
function play(el, frames, opts) {
  if (!el || !el.animate) return null;
  try { return el.animate(frames, opts); } catch { return null; }
}

export function initFlowers(plaque) {
  if (!plaque || plaque.dataset.hof) return;
  plaque.dataset.hof = '1';
  const id = likeId();
  const st = { n: 0, mine: null, busy: false };
  let layer = null;
  let cap = null;
  let size = '';
  let taps = [];

  /* ---------- 꽃 자리 ----------
     현판 둘레를 한 줄로 펴 놓고, 황금비 간격으로 차례차례 자리를 줍니다.
     그래서 꽃이 적을 땐 듬성듬성 고르게, 많아지면 화환처럼 촘촘해집니다. */
  function spots() {
    const W = plaque.offsetWidth;
    const H = plaque.offsetHeight;
    const P = 2 * (W + H);
    const box = plaque.getBoundingClientRect();
    const roomL = box.left;
    const roomR = document.documentElement.clientWidth - box.right;
    const n = st.n;
    const k = Math.min(1.45, Math.max(1, W / 358));         // 넓은 현판(PC)에서는 조금 크게
    const base = (n <= 12 ? 54 : n <= 40 ? 44 : 34) * k;    // 많아질수록 작게 — 이름을 덮지 않게
    const e = 1.5;                                           // 이중 테두리 한가운데
    const list = [];
    for (let i = 0; i < Math.min(n, MAX_DRAW); i += 1) list.push(i);
    if (st.mine != null && st.mine >= MAX_DRAW && st.mine < n) list.push(st.mine);
    return list.map((i) => {
      const s0 = ((0.07 + i * 0.6180339887) % 1) * P;
      let x; let y; let ang;
      if (s0 < W) { x = s0; y = e; ang = 0; }
      else if (s0 < W + H) { x = W - e; y = s0 - W; ang = 90; }
      else if (s0 < 2 * W + H) { x = W - (s0 - W - H); y = H - e; ang = 180; }
      else { x = e; y = H - (s0 - 2 * W - H); ang = 270; }
      let kind = KINDS[Math.floor(rnd(i, 3) * KINDS.length)];
      if (kind.side && ang === 180) kind = FLAT[Math.floor(rnd(i, 6) * FLAT.length)];
      const s = base * (0.85 + rnd(i, 2) * 0.35);
      let out = kind.side ? s * 0.28 + (rnd(i, 1) - 0.5) * 6 : (rnd(i, 1) - 0.4) * 14;
      // 폰처럼 옆 여백이 좁으면 꽃이 화면 끝에 많이 잘리지 않게 안으로 조금 당깁니다 (8할은 보이게)
      if (ang === 90) out = Math.min(out, roomR - s * 0.3);
      if (ang === 270) out = Math.min(out, roomL - s * 0.3);
      const rad = (ang - 90) * Math.PI / 180;
      const tilt = ang === 0 ? 0 : ang === 90 ? 38 : -38;
      return {
        i, kind, s,
        x: x + Math.cos(rad) * out,
        y: y + Math.sin(rad) * out,
        r: kind.side ? tilt + (rnd(i, 5) - 0.5) * 30 : rnd(i, 5) * 360,
      };
    });
  }

  function draw() {
    if (!layer) return;
    layer.innerHTML = spots().map((f) => `<i class="hof__f${f.kind.side ? ' hof__f--side' : ''}${f.kind.img ? '' : ' is-svg'}${f.i === st.mine ? ' is-mine' : ''}" data-i="${f.i}" style="left:${f.x.toFixed(1)}px;top:${f.y.toFixed(1)}px;width:${f.s.toFixed(1)}px;height:${f.s.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${f.r.toFixed(0)}deg)"><img src="${f.kind.img || f.kind.src}" alt="" decoding="async" draggable="false"></i>`).join('');
    size = `${plaque.offsetWidth}x${plaque.offsetHeight}`;
  }

  // 현판 밑 한 줄: '선배님께 핀 꽃 N송이'. 꽃이 하나도 없으면 아무것도 쓰지 않습니다 (숨은 재미라서).
  function paintCap() {
    if (!st.n) { if (cap) cap.remove(); cap = null; return; }
    if (!cap) {
      cap = document.createElement('p');
      cap.className = 'hof__cap';
      plaque.after(cap);
    }
    cap.innerHTML = `선배님께 핀 꽃 <b>${st.n}</b>송이`;
  }

  const mineEl = () => (st.mine == null ? null : layer && layer.querySelector(`.hof__f[data-i="${st.mine}"]`));

  /* ---------- 움직임 ---------- */
  // 누를 때마다 종이 부스러기가 톡톡 — 두 번째 누름부터, 누를수록 많이
  function sparks(e, count) {
    if (reducedMotion() || !layer) return;
    const box = plaque.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    for (let j = 0; j < Math.min(8, count + 1); j += 1) {
      const b = document.createElement('b');
      b.className = 'hof__bit';
      b.style.cssText = `left:${x}px;top:${y}px;background:${PAPER[(j + count) % PAPER.length]}`;
      layer.append(b);
      const a = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 16 + count * 3;
      const r = (Math.random() - 0.5) * 540;
      const an = play(b, [
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 1 },
        { transform: `translate(calc(-50% + ${(Math.cos(a) * d).toFixed(1)}px), calc(-50% + ${(Math.sin(a) * d).toFixed(1)}px)) rotate(${r.toFixed(0)}deg) scale(1)`, opacity: 0 },
      ], { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' });
      if (an) an.onfinish = () => b.remove(); else b.remove();
    }
  }

  // 내 꽃이 피어납니다 — 종이꽃이 펼쳐지고, 둘레로 금빛 고리와 색종이가 퍼집니다
  function celebrate() {
    const el = mineEl();
    if (!el || reducedMotion()) return;
    const img = el.firstElementChild;
    const side = el.classList.contains('hof__f--side');
    play(img, side ? [
      { transform: 'scale(.3, 0)', opacity: 0 },
      { transform: 'scale(1.06, 1.16)', opacity: 1, offset: 0.62 },
      { transform: 'scale(.97, .95)', offset: 0.82 },
      { transform: 'none', opacity: 1 },
    ] : [
      { transform: 'scale(0) rotate(-150deg)', opacity: 0 },
      { transform: 'scale(1.3) rotate(14deg)', opacity: 1, offset: 0.62 },
      { transform: 'scale(.94) rotate(-4deg)', offset: 0.82 },
      { transform: 'none', opacity: 1 },
    ], { duration: 950, easing: 'cubic-bezier(.2,.8,.3,1)' });
    const cx = parseFloat(el.style.left);
    const cy = parseFloat(el.style.top);
    const s = parseFloat(el.style.width);
    const ring = document.createElement('b');
    ring.className = 'hof__ring';
    ring.style.cssText = `left:${cx}px;top:${cy}px;width:${s * 1.6}px;height:${s * 1.6}px`;
    layer.append(ring);
    const ra = play(ring, [
      { transform: 'translate(-50%,-50%) scale(.25)', opacity: 0.95 },
      { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0 },
    ], { duration: 900, delay: 260, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
    if (ra) ra.onfinish = () => ring.remove(); else ring.remove();
    for (let j = 0; j < 14; j += 1) {
      const b = document.createElement('b');
      b.className = 'hof__bit';
      b.style.cssText = `left:${cx}px;top:${cy}px;background:${PAPER[j % PAPER.length]}`;
      layer.append(b);
      const a = (j / 14) * Math.PI * 2 + Math.random() * 0.4;
      const d = s * 0.7 + Math.random() * s * 0.6;
      const r = (Math.random() - 0.5) * 720;
      const an = play(b, [
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 },
        { transform: `translate(calc(-50% + ${(Math.cos(a) * d).toFixed(1)}px), calc(-50% + ${(Math.sin(a) * d + 10).toFixed(1)}px)) rotate(${r.toFixed(0)}deg) scale(1.1)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 400, delay: 200, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'backwards' });
      if (an) an.onfinish = () => b.remove(); else b.remove();
    }
  }

  // 이미 피운 분이 또 누르면, 내 꽃이 '여기 있어요' 하고 흔들립니다
  function wiggle() {
    const el = mineEl();
    if (!el || reducedMotion()) return;
    el.classList.add('is-hi');
    const an = play(el.firstElementChild, [
      { transform: 'none' },
      { transform: 'scale(1.32) rotate(-14deg)', offset: 0.22 },
      { transform: 'scale(1.32) rotate(12deg)', offset: 0.46 },
      { transform: 'scale(1.22) rotate(-7deg)', offset: 0.7 },
      { transform: 'none' },
    ], { duration: 850, easing: 'ease-in-out' });
    const off = () => el.classList.remove('is-hi');
    if (an) an.onfinish = off; else off();
  }

  /* ---------- 피우기 ---------- */
  async function bloom() {
    if (st.busy) return;
    if (st.mine != null) { wiggle(); toast(ONE); return; }
    st.busy = true;
    let d = null;
    let code = 0;
    try {
      const r = await fetch('/api/flower', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u: id }),
      });
      code = r.status;
      d = await r.json().catch(() => null);
    } catch { /* 연결이 끊김 */ }
    st.busy = false;
    if (!d || !d.ok || !Number.isInteger(d.mine)) {
      toast(code === 429 ? '잠시 뒤에 다시 눌러 주세요' : '꽃을 피우지 못했습니다. 잠시 뒤에 다시 눌러 주세요');
      return;
    }
    st.n = Math.max(st.n, d.n | 0, d.mine + 1);
    st.mine = d.mine;
    draw();
    paintCap();
    if (d.new) {
      celebrate();
      toast(`선배님께 ${d.mine + 1}번째 꽃을 드렸습니다`, 2600);
    } else {
      wiggle();
      toast(ONE);
    }
  }

  function wire() {
    plaque.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = performance.now();
      taps = taps.filter((x) => t - x < SPAN);
      taps.push(t);
      if (taps.length >= 2) sparks(e, taps.length);
      if (taps.length >= TAPS) { taps = []; bloom(); }
    });
    // 연타하면 PC 에서는 글자가 파랗게 칠해집니다. 두 번째 누름부터는 칠하지 않습니다 (끌어서 고르기는 그대로).
    plaque.addEventListener('mousedown', (e) => { if (e.detail > 1) e.preventDefault(); });
    // 현판 크기가 바뀌면(화면 돌림 · 글꼴이 늦게 옴) 다시 놓습니다
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        if (`${plaque.offsetWidth}x${plaque.offsetHeight}` !== size) draw();
      }).observe(plaque);
    }
  }

  fetch(`/api/flowers?u=${encodeURIComponent(id)}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then(async (d) => {
      if (!d || !d.ok) return;                 // 서버가 아직 모름 → 아무 일도 없습니다
      if (!(await loadCss())) return;
      await bakeAll();
      st.n = Math.max(0, d.n | 0);
      st.mine = Number.isInteger(d.mine) ? d.mine : null;
      plaque.classList.add('hof');
      layer = document.createElement('div');
      layer.className = 'hof__layer';
      layer.setAttribute('aria-hidden', 'true');
      plaque.append(layer);
      draw();
      paintCap();
      wire();
      if (st.n && !reducedMotion()) play(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
    })
    .catch(() => { /* 꽃 없이 그대로 */ });
}
