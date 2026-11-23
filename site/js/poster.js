// ============================================================
// poster.js — 포스터를 눌러 크게 펼쳐 보기
//
// 누르면 주변이 천천히 어두워지고 포스터가 제자리에서 스르륵 커집니다.
// 커진 뒤에는 손가락(또는 마우스)으로 카드처럼 돌릴 수 있고,
// 돌아가는 각도에 따라 표면에 빛이 지나갑니다. 뒷면도 있습니다.
// 다시 누르면 있던 자리로 되돌아갑니다.
//
// 자리를 옮기는 방법은 FLIP 입니다 — 끝자리에 미리 앉혀 놓고,
// 시작 자리로 보이도록 변형을 씌운 뒤 그 변형을 풀어 줍니다.
// 그래야 폭·높이를 애니메이션하지 않아서 글씨가 일그러지지 않습니다.
// ============================================================
import { $, reducedMotion } from './util.js';

const RATIO = 800 / 1136;        // 포스터 가로세로비
const OPEN_MS = 900;             // 천천히 — 요청대로
const CLOSE_MS = 620;

let view = null;
let card = null;
let src = null;                  // 히어로의 포스터 액자
let openState = false;
let spin = null;

export function initPoster() {
  src = $('.hero__poster-frame');
  const poster = $('.hero__poster');
  const img = src && $('img', src);
  if (!src || !poster || !img) return;

  poster.setAttribute('role', 'button');
  poster.setAttribute('tabindex', '0');
  poster.setAttribute('aria-label', '포스터 크게 보기');
  poster.style.cursor = 'zoom-in';

  // 문지르기(기울이기)와 구분합니다. 손가락이 많이 움직였으면 누른 것으로 치지 않습니다.
  let sx = 0, sy = 0, moved = 0;
  poster.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; moved = 0; });
  poster.addEventListener('pointermove', (e) => {
    moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
  });
  poster.addEventListener('click', () => { if (moved <= 12) open(img); });
  poster.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img); }
  });
}

/* ---------- 화면 만들기 (처음 열 때 한 번) ---------- */
function build(img) {
  view = document.createElement('div');
  view.className = 'pv';
  view.hidden = true;
  view.innerHTML = `
    <div class="pv__scrim" data-pvclose></div>
    <div class="pv__card" id="pvCard">
      <div class="pv__face pv__face--front">
        <img src="${img.currentSrc || img.src}" alt="${img.alt || '포스터'}" draggable="false">
        <i class="pv__sheen" aria-hidden="true"></i>
      </div>
      <div class="pv__face pv__face--back" aria-hidden="true">
        <span class="pv__back-mark">I.F</span>
        <span class="pv__back-line">2026 LIVE PERFORMANCE</span>
        <span class="pv__back-date">2026.11.05 THU</span>
        <span class="pv__back-place">청춘싸롱 · 제천</span>
        <span class="pv__back-since">SINCE 1992</span>
        <i class="pv__sheen" aria-hidden="true"></i>
      </div>
    </div>
    <button class="pv__x" type="button" data-pvclose aria-label="닫기">×</button>
    <p class="pv__hint">끌어서 돌리고, 빈 곳을 눌러 닫을&nbsp;수 있습니다.</p>`;
  document.body.appendChild(view);
  card = $('#pvCard', view);

  view.addEventListener('click', (e) => { if (e.target.closest('[data-pvclose]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openState) close(); });
  window.addEventListener('resize', () => { if (openState) sizeCard(); }, { passive: true });
  setupSpin();
}

/* 화면에 맞춰 카드 크기를 정합니다. aspect-ratio 를 모르는 기기가 있어 직접 계산합니다. */
function sizeCard() {
  const h = Math.min(window.innerHeight * 0.82, window.innerWidth * 0.92 / RATIO);
  card.style.height = `${Math.round(h)}px`;
  card.style.width = `${Math.round(h * RATIO)}px`;
}

/* ---------- 열기 ---------- */
function open(img) {
  if (openState) return;
  if (!view) build(img);
  openState = true;
  document.body.style.overflow = 'hidden';
  if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();

  view.hidden = false;
  sizeCard();
  spin.reset();

  const from = src.getBoundingClientRect();
  const to = card.getBoundingClientRect();
  const k = from.width / to.width;
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
  const dy = (from.top + from.height / 2) - (to.top + to.height / 2);

  if (reducedMotion()) {
    view.classList.add('is-open');
    spin.start();
    return;
  }
  // 시작 자리로 보이게 해 두고
  card.style.transition = 'none';
  card.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${k})`;
  void card.offsetWidth;                       // 값을 굳힙니다
  // 풀어 줍니다
  card.style.transition = `transform ${OPEN_MS}ms cubic-bezier(.22,1,.36,1)`;
  card.style.transform = 'translate3d(0,0,0) scale(1)';
  view.classList.add('is-open');
  setTimeout(() => {
    if (!openState) return;
    card.style.transition = '';
    card.style.transform = '';
    spin.start();                               // 다 커진 뒤에 돌리기 시작
  }, OPEN_MS);
}

/* ---------- 닫기 ---------- */
function close() {
  if (!openState) return;
  openState = false;
  spin.stop();

  const finish = () => {
    view.hidden = true;
    view.classList.remove('is-open', 'is-closing');
    card.style.transition = '';
    card.style.transform = '';
    document.body.style.overflow = '';
    if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();
  };
  if (reducedMotion()) { finish(); return; }

  const from = src.getBoundingClientRect();
  const to = card.getBoundingClientRect();
  // 돌아가 있는 상태에서 재면 폭이 줄어 보이므로, 각도를 푼 뒤의 크기로 계산합니다
  const w = parseFloat(card.style.width) || to.width;
  const k = from.width / w;
  const dx = (from.left + from.width / 2) - (window.innerWidth / 2);
  const dy = (from.top + from.height / 2) - (window.innerHeight / 2);

  view.classList.add('is-closing');
  card.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(.4,0,.2,1)`;
  card.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${k})`;
  setTimeout(finish, CLOSE_MS);
}

/* ---------- 돌리기와 빛반사 ----------
   가로로 끌면 좌우로, 세로로 끌면 위아래로 돕니다.
   놓으면 남은 힘만큼 더 돌다가 앞뒤 중 가까운 면으로 스르륵 멎습니다. */
function setupSpin() {
  let ry = 0, rx = 0;     // 지금 각도
  let vy = 0, vx = 0;     // 남은 힘
  let drag = false, lx = 0, ly = 0, moved = 0;
  let raf = 0, live = false;

  const paint = () => {
    card.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    card.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    // 빛은 각도를 따라 표면을 지나갑니다
    const t = Math.max(-1, Math.min(1, (((ry % 360) + 540) % 360 - 180) / 90));
    card.style.setProperty('--sheen', `${(t * 115).toFixed(1)}%`);
    card.classList.toggle('is-back', Math.abs(((ry % 360) + 450) % 360 - 180) < 90);
  };

  // 끄는 동안은 move 가 바로 그리므로 돌지 않고, 놓은 뒤 남은 힘이 다해 한 면에 멎으면 쉽니다.
  // (예전엔 포스터를 펼쳐 두기만 해도 1초에 60번 같은 각도를 다시 그렸습니다)
  const step = () => {
    if (!live || drag) { raf = 0; return; }
    ry += vy; rx += vx;
    vy *= 0.94; vx *= 0.9;
    rx += (0 - rx) * 0.06;                      // 위아래는 슬며시 수평으로
    let still = false;
    if (Math.abs(vy) < 0.06) {                  // 힘이 다하면 가까운 면으로
      vy = 0;
      const snap = Math.round(ry / 180) * 180;
      ry += (snap - ry) * 0.12;
      if (Math.abs(snap - ry) < 0.05) ry = snap;
      still = ry === snap && Math.abs(rx) < 0.02 && Math.abs(vx) < 0.002;
    }
    if (still) { rx = 0; vx = 0; }
    paint();
    raf = still ? 0 : requestAnimationFrame(step);
  };
  const kick = () => { if (!raf && live) raf = requestAnimationFrame(step); };

  const down = (e) => {
    if (e.target.closest('[data-pvclose]')) return;
    drag = true; moved = 0;
    lx = e.clientX; ly = e.clientY;
    vy = 0; vx = 0;
    card.classList.add('is-held');
    try { card.setPointerCapture(e.pointerId); } catch (err) { /* 손가락을 붙들 수 없어도 됩니다 */ }
  };
  const move = (e) => {
    if (!drag) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    ry += dx * 0.55;
    rx = Math.max(-42, Math.min(42, rx - dy * 0.35));
    vy = dx * 0.55; vx = -dy * 0.2;
    // 끄는 동안은 바로 그립니다. 다음 프레임을 기다리면 손보다 한 박자 늦습니다.
    paint();
  };
  const up = () => {
    if (!drag) return;
    drag = false;
    card.classList.remove('is-held');
    kick();
    // 끌지 않고 그냥 눌렀으면 닫습니다
    if (moved < 10) close();
  };

  card.addEventListener('pointerdown', down);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
  card.addEventListener('lostpointercapture', up);
  // 카드 위에서는 화면이 밀리지 않게 (돌리는 중에 스크롤되면 어지럽습니다)
  card.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });

  spin = {
    reset() { ry = 0; rx = 0; vy = 0; vx = 0; drag = false; paint(); },
    start() { live = true; kick(); },
    stop() { live = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } drag = false; },
  };
}
