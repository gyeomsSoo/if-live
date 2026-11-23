// ============================================================
// interact.js — 스크롤을 내려가며 만나는 작은 재미들
//
// 히어로 아래쪽은 나타나기 모션 말고는 손댈 곳이 없어서 심심했습니다.
// 다섯 가지를 얹습니다. 전부 있으면 좋고 없어도 되는 것들이라,
// 모션 감소 설정이거나 스크린샷 모드면 아무것도 하지 않습니다.
//
//   1. 숫자 세기      26곳 · 10곡 이 0 부터 올라갑니다
//   2. 카드 기울기    마우스를 따라 카드가 입체로 기웁니다
//   3. 자석 버튼      버튼이 커서 쪽으로 살짝 끌려옵니다
//   4. 흐름 잔상      빠르게 스크롤하면 흐르는 띠에 잔상이 집니다
//   5. 진행 막대      맨 위에 얼마나 읽었는지 가는 선으로
// ============================================================
import { $, $$, reducedMotion, onceInView } from './util.js';

const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const raf = (fn) => window.requestAnimationFrame(fn);

/* ---------- 스크롤을 듣는 곳은 하나로 ----------
   따로따로 듣게 두면 스크롤 한 칸에 여러 번 깨어납니다.
   한 번만 듣고, 한 프레임에 한 번만 나눠 줍니다. */
const scrollJobs = [];
let scrollTick = false;
function onScroll(fn) {
  scrollJobs.push(fn);
  if (scrollJobs.length > 1) return;
  const run = () => { scrollTick = false; scrollJobs.forEach((f) => f()); };
  window.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = true;
    raf(run);
  }, { passive: true });
}

/* ---------- 화면 밖 움직임 재우기 ----------
   끝없이 도는 움직임은 화면 밖에서도 계속 계산됩니다. 보이지 않는 동안은 세워 둡니다.
   멈춘 자리에서 이어 흐르므로 다시 올라와도 티가 나지 않습니다. */
function sleepOffscreen(sel, margin = '150px 0px', cls = 'is-idle') {
  const els = $$(sel);
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle(cls, !e.isIntersecting));
  }, { rootMargin: margin });
  els.forEach((el) => io.observe(el));
}

export function initInteract() {
  if (reducedMotion() || document.documentElement.classList.contains('shot')) return;
  countUp();
  if (FINE) { tiltCards(); magnetic(); }
  marqueeTrail();
  progressBar();
  sleepOffscreen('#hero, .ticker__track, .marquee__track, .eq, .shop__art');
  // 간판 그림은 멀리(600px 밖) 가면 아예 내려놓고, 화면에 닿기 한참 전에 되살립니다 (shop-card.css 의 .is-far)
  sleepOffscreen('.shop__art', '600px 0px', 'is-far');
}

/* ---------- 1. 숫자 세기 ----------
   '함께해 주신 26곳' 의 26 이 0 부터 올라갑니다. 데이터가 채운 뒤의 값을 목표로 잡습니다. */
function countUp() {
  const targets = $$('#setlistCount, #sponsorCount, #spCount');
  onceInView(targets, (el) => {
    const goal = parseInt(el.textContent, 10);
    if (!Number.isFinite(goal) || goal <= 0) return;
    const dur = 900;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const ease = 1 - (1 - p) ** 3;
      el.textContent = String(Math.round(goal * ease));
      if (p < 1) raf(step);
      else { el.textContent = String(goal); el.dataset.counted = String(goal); }
    };
    raf(step);
  });
}

/* ---------- 2. 카드 기울기 ----------
   마우스가 놓인 쪽으로 카드가 기웁니다. 히어로 포스터와 같은 감각을 아래까지 잇습니다.
   손가락에는 걸지 않습니다 — 터치에서는 누르는 반응이 이미 있습니다.

   기울기는 카드의 transform 에 직접 씁니다. 예전엔 --rx 같은 CSS 변수로 넘겼는데, CSS 변수는 자식에게
   물려 내려가서 마우스가 움직일 때마다 카드 안의 모든 요소(간판 그림의 도형 수백 개)를 다시 계산했습니다.
   빛 자국은 카드 맨 앞에 끼운 빈 요소(.tilt__shine)에만 위치를 줍니다. 그리기는 한 프레임에 한 번입니다. */
const TILT = '.shop, .sp--sign, .ncard, .tkcard';

function tiltCards() {
  $$(TILT).forEach((card) => {
    card.classList.add('tilt');
    const max = card.classList.contains('shop') ? 5 : 7;
    const sign = card.matches('.shop, .sp--sign');
    // interact.css 의 :hover 와 같은 떠오름. 기울기 뒤에 붙입니다
    const lift = sign ? ' translate3d(-3px, -4px, 0)' : ' translate3d(0, -3px, 0)';
    let shine = null;
    if (sign) {
      shine = document.createElement('i');
      shine.className = 'tilt__shine';
      shine.setAttribute('aria-hidden', 'true');
      card.prepend(shine);           // 예전 ::before 와 같은 자리(맨 앞) — 겹치는 순서가 그대로입니다
    }
    let rect = null;
    let at = null;
    let id = 0;
    const draw = () => {
      id = 0;
      if (!at || !rect) return;
      const x = (at.x - rect.left) / rect.width - 0.5;
      const y = (at.y - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg)${lift}`;
      if (shine) {
        shine.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
        shine.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
      }
    };
    card.addEventListener('pointerenter', () => { rect = card.getBoundingClientRect(); });
    card.addEventListener('pointermove', (e) => {
      if (!rect) rect = card.getBoundingClientRect();
      at = { x: e.clientX, y: e.clientY };
      if (!id) id = raf(draw);
    });
    card.addEventListener('pointerleave', () => {
      if (id) cancelAnimationFrame(id);
      id = 0;
      rect = null;
      at = null;
      card.style.transform = '';     // CSS 의 제자리로 스르륵 돌아갑니다 (.tilt 의 transition)
    });
  });
  // 창 크기가 바뀌면 재둔 값이 어긋나므로 다음 진입에서 다시 재게 합니다
  window.addEventListener('resize', () => {
    $$('.tilt').forEach((c) => { c.style.transform = ''; });
  }, { passive: true });
}

/* ---------- 3. 자석 버튼 ----------
   커서가 다가오면 버튼이 그쪽으로 조금 끌려옵니다. 누르기 전에 이미 반응이 옵니다. */
function magnetic() {
  $$('.btn, .sbtn, .tab, .totop').forEach((btn) => {
    btn.classList.add('mag');
    // 처음부터 자기 값을 가져 둡니다. 안 그러면 기울어지는 카드(.tkcard 등)가 쓰는 --mx/--my(%)를
    // 물려받아, 카드에 마우스만 올려도 버튼이 버튼 폭만큼 옆으로 밀려났습니다.
    btn.style.setProperty('--mx', '0px');
    btn.style.setProperty('--my', '0px');
    const pull = 0.22;
    // 버튼 자리는 들어올 때 한 번만 잽니다. 마우스가 움직일 때마다 다시 재면
    // 그때마다 브라우저가 쪽 배치를 통째로 다시 계산합니다.
    let r = null;
    let pending = null;
    const draw = () => {
      const at = pending;
      pending = null;
      if (!at || !r) return;
      const dx = (at.x - (r.left + r.width / 2)) * pull;
      const dy = (at.y - (r.top + r.height / 2)) * pull;
      btn.style.setProperty('--mx', `${dx.toFixed(1)}px`);
      btn.style.setProperty('--my', `${dy.toFixed(1)}px`);
    };
    btn.addEventListener('pointerenter', () => { r = btn.getBoundingClientRect(); });
    btn.addEventListener('pointermove', (e) => {
      if (!r) r = btn.getBoundingClientRect();
      const first = !pending;
      pending = { x: e.clientX, y: e.clientY };   // 한 프레임에 한 번만 그립니다
      if (first) raf(draw);
    });
    btn.addEventListener('pointerleave', () => {
      r = null;
      pending = null;
      btn.style.setProperty('--mx', '0px');
      btn.style.setProperty('--my', '0px');
    });
  });
}

/* ---------- 4. 흐름 잔상 ----------
   빠르게 스크롤하면 흐르는 띠가 속도를 따라 흐려집니다. 종이가 바람에 스치는 느낌입니다. */
function marqueeTrail() {
  const tracks = $$('.ticker__track, .marquee__track');
  if (!tracks.length) return;
  let last = window.scrollY;
  let v = 0;
  let cooling = false;
  const paint = () => {
    v *= 0.88;
    const blur = Math.min(v * 0.09, 3.4);
    const f = blur > 0.08 ? `blur(${blur.toFixed(2)}px)` : '';
    tracks.forEach((t) => {
      // 화면 밖에서 재워 둔 띠는 건드리지 않습니다
      if (t.classList.contains('is-idle')) return;
      // 같은 값이면 쓰지 않습니다. (예전엔 받는 곳 없는 --mq-stretch 도 매 프레임 써서 띠 안의 글자까지 다시 계산했습니다)
      if (t.style.filter !== f) t.style.filter = f;
    });
    // 스크롤을 멈춘 뒤에도 잔상이 부드럽게 가라앉도록 잠깐 더 돕니다
    cooling = v > 0.4;
    if (cooling) raf(paint);
  };
  onScroll(() => {
    const y = window.scrollY;
    v = Math.min(v + Math.abs(y - last), 60);
    last = y;
    if (!cooling) { cooling = true; raf(paint); }
  });
}

/* ---------- 5. 진행 막대 ----------
   맨 위에 얼마나 읽었는지 가는 선으로 보여 줍니다. */
function progressBar() {
  const bar = document.createElement('div');
  bar.className = 'sprog';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<i></i>';
  document.body.appendChild(bar);
  const fill = $('i', bar);

  // 쪽 길이는 스크롤한다고 바뀌지 않습니다. 한 번 재서 들고 있습니다.
  // 매 프레임 scrollHeight 를 물으면 그때마다 배치를 다시 계산하게 됩니다.
  let max = 0;
  const paint = () => {
    const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  const measure = () => {
    const de = document.documentElement;
    max = de.scrollHeight - de.clientHeight;
    paint();
  };
  onScroll(paint);
  window.addEventListener('resize', measure, { passive: true });
  // 후원사 칸이 채워지거나 사진이 들어오면 쪽 길이가 달라집니다. 그때만 다시 잽니다.
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  window.addEventListener('load', measure, { once: true });
  measure();
}
