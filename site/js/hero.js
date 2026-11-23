// 히어로 (에이전트 A)
// 1) Lenis 부드러운 스크롤 (앵커 링크 포함)
// 2) 첫 로드 진입 연출 — 폰트 로딩 후, 1.2초 이내, GSAP 없으면 그냥 보임
// 3) 포스터 3D 틸트 + 커서를 따라가는 핑크 조명 (마우스 기기만, 터치는 정적)
// 4) 스크롤 패럴랙스 — 포스터는 살짝 작아지며 위로, 헤드라인은 반대로
// 모션은 있으면 좋고 없어도 되는 것: 어떤 경로로도 콘텐츠가 숨겨진 채 남지 않게 한다.
import { $, $$, reducedMotion } from './util.js';

// 앵커로 이동할 때 네비에 가리지 않도록 비켜 둘 높이. 실제 네비를 재서 씁니다.
const INTRO_FONT_WAIT = 1000; // 폰트가 늦어도 이 시간이 지나면 연출 시작

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initHero() {
  const html = document.documentElement;
  const revealAll = () => html.classList.remove('is-intro');
  calmScrollTriggerLoop();

  // 모션 감소 설정이거나 관리 화면의 '누른 곳 지도'(?heat)면 부드러운 스크롤·연출·패럴랙스 없이 그대로 보입니다
  if (reducedMotion() || html.classList.contains('heat')) { revealAll(); return; }

  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (gsap && ST) gsap.registerPlugin(ST);

  setupLenis(gsap, ST);

  const hero = $('#hero');
  if (!hero) { revealAll(); return; }

  setupPointer(hero);

  const afterIntro = () => setupParallax(gsap, ST, hero);
  if (gsap && html.classList.contains('is-intro')) runIntro(gsap, hero, afterIntro);
  else { revealAll(); afterIntro(); }
}

/* ---------- ScrollTrigger 의 빈 고리 재우기 ----------
   ScrollTrigger(3.12.5)는 시작하자마자 아무 일도 하지 않는 requestAnimationFrame 고리(_rafBugFix)를 끝없이 돌립니다.
   원본 주석: "Firefox 같은 브라우저는 rAF 에 무언가 걸려 있지 않으면 화면 갱신이 들쭉날쭉해서".
   그 탓에 모든 브라우저가 아무도 손대지 않아도 1초에 60~120번 화면 한 장을 새로 만들었습니다(폰 배터리).
   스크롤 · 휠 · 터치 · 누르기가 있는 동안과 그 뒤 1.5초만 돌게 하고, 조용해지면 재웁니다.
   이 이름의 콜백 말고는 그대로 통과시킵니다. (gsap 은 index.html 에서 3.12.5 로 고정되어 있습니다) */
function calmScrollTriggerLoop() {
  const native = window.requestAnimationFrame;
  if (typeof native !== 'function' || native.ifCalm) return;
  let parked = null;
  let busyUntil = 0;
  const calm = function requestAnimationFrame(cb) {
    if (cb && cb.name === '_rafBugFix' && performance.now() > busyUntil) { parked = cb; return 0; }
    return native.call(window, cb);
  };
  calm.ifCalm = true;
  window.requestAnimationFrame = calm;
  const stir = () => {
    busyUntil = performance.now() + 1500;
    if (parked) { const cb = parked; parked = null; native.call(window, cb); }
  };
  ['scroll', 'wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown']
    .forEach((ev) => window.addEventListener(ev, stir, { passive: true, capture: true }));
}

/* ---------- Lenis ---------- */
function setupLenis(gsap, ST) {
  if (!window.Lenis) return;
  let lenis;
  try { lenis = new window.Lenis({ duration: 1.1, smoothWheel: true }); } catch { return; }
  window.lenis = lenis; // 맨 위로 버튼(share.js) 등에서 사용

  if (gsap && ST) {
    lenis.on('scroll', ST.update);
    gsap.ticker.lagSmoothing(0);
  }

  // Lenis 는 미끄러지는 동안에만 깨웁니다.
  // 예전엔 GSAP 시계에 붙여 두어서 아무도 스크롤하지 않아도 1초에 60번(120Hz 폰은 120번) 깨어났고,
  // 그때마다 브라우저가 화면 한 장을 새로 만들었습니다. 이제 휠이나 이동 명령(앵커 · 맨 위로)이 올 때만 돌고,
  // 미끄러짐이 끝나면 잠듭니다. (손가락 스크롤은 Lenis 가 손대지 않는 브라우저 기본 스크롤이라 깨울 필요가 없습니다)
  // Lenis 에는 흐른 시간만 넘깁니다. 잠들었다 깬 첫 프레임에 '몇 초 지났다' 고 알리면 미끄러짐을
  // 한 번에 끝내 버리므로, 깬 첫 프레임은 0, 그다음부터 실제 간격(최대 0.1초)을 더합니다.
  let id = 0;
  let prev = 0;
  let clock = 1;
  const loop = (t) => {
    clock += prev ? Math.min(t - prev, 100) : 0;
    prev = t;
    lenis.raf(clock);
    if (lenis.isScrolling === 'smooth') { id = requestAnimationFrame(loop); return; }
    id = 0;
    prev = 0;
  };
  const wake = () => { if (!id) id = requestAnimationFrame(loop); };
  window.addEventListener('wheel', wake, { passive: true, capture: true });
  const scrollTo = lenis.scrollTo.bind(lenis);
  lenis.scrollTo = (...args) => { scrollTo(...args); wake(); };

  // 앵커 링크는 Lenis 로. 네비가 sticky 라 그 높이만큼 위에서 멈춘다.
  // .skip(본문 바로가기)은 제외: 네이티브 앵커 이동이어야 포커스가 본문으로 옮겨간다 (Lenis 로 가로채면 포커스가 링크에 남음)
  $$('a[href^="#"]:not(.skip)').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
      if (href.length < 2) return;
      let target = null;
      try { target = document.querySelector(href); } catch { return; }
      if (!target) return;
      e.preventDefault();
      if (href === '#top') lenis.scrollTo(0);
      else {
        const nav = document.querySelector('.nav');
        const navH = nav ? nav.getBoundingClientRect().height : 76;
        lenis.scrollTo(target, { offset: -navH });
      }
    });
  });
}

/* ---------- 터치 기기용 포스터 기울이기 ----------
   마우스가 없으니 손가락으로 포스터를 문지르면 기울어지고,
   떼면 천천히 제자리로 돌아옵니다. 기기를 기울여도 반응합니다. */
function setupTouchTilt(hero) {
  const frame = $('.hero__poster-frame', hero);
  const poster = $('.hero__poster', hero);
  if (!frame || !poster) return;

  let rx = 0, ry = 0, tx = 0, ty = 0, raf = 0;
  const clampT = (v) => clamp(v, -10, 10);

  const render = () => {
    rx += (tx - rx) * 0.18;
    ry += (ty - ry) * 0.18;
    frame.style.transform = `perspective(900px) rotateY(${ry.toFixed(2)}deg) rotateX(${(-rx).toFixed(2)}deg)`;
    if (Math.abs(tx - rx) + Math.abs(ty - ry) > 0.05) { raf = requestAnimationFrame(render); return; }
    raf = 0;
    // 완전히 제자리로 돌아온 뒤에야 인라인 스타일을 지웁니다.
    // 일찍 지우면 떠 있는 애니메이션이 중간부터 이어받아 툭 튑니다.
    if (tx === 0 && ty === 0) { frame.style.transform = ''; poster.classList.remove('is-touched'); }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(render); };

  // 손가락으로 문지르기 (포스터 위에서만, 스크롤은 그대로 둡니다)
  let startX = 0, startY = 0, dragging = false;
  poster.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; dragging = true;
    poster.classList.add('is-touched');
  }, { passive: true });
  poster.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    ty = clampT((t.clientX - startX) / 8);
    tx = clampT((t.clientY - startY) / 8);
    kick();
  }, { passive: true });
  const end = () => { dragging = false; tx = 0; ty = 0; kick(); };
  poster.addEventListener('touchend', end, { passive: true });
  poster.addEventListener('touchcancel', end, { passive: true });

  // 기기 기울이기 (안드로이드는 바로, iOS 는 허용을 물어봐야 해서 생략)
  // 기울기 신호는 폰을 들고만 있어도 1초에 60번쯤 옵니다. 보이지 않는 동안은 그리지 않습니다:
  //   - 포스터가 화면 밖이거나 다른 탭을 보고 있을 때
  //   - 폰(640px 이하)에서 손대기 전: 포스터가 CSS 로 둥실 떠 있고, CSS 애니메이션은 요소에 직접 쓴
  //     transform 보다 세서 기울기가 화면에 나오지 않습니다 (mobile.css 의 posterFloat)
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission !== 'function') {
    let base = null;
    let seen = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; }).observe(poster);
    }
    const floats = window.matchMedia('(max-width: 640px)');
    window.addEventListener('deviceorientation', (e) => {
      if (dragging || e.beta == null || e.gamma == null) return;
      if (!base) base = { beta: e.beta, gamma: e.gamma };
      ty = clampT((e.gamma - base.gamma) / 3);
      tx = clampT((e.beta - base.beta) / 3);
      if (!seen || document.hidden || (floats.matches && !poster.classList.contains('is-touched'))) return;
      kick();
    }, { passive: true });
  }
}

/* ---------- 틸트 + 조명 (마우스만) ---------- */
function setupPointer(hero) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) { setupTouchTilt(hero); return; }
  const frame = $('.hero__poster-frame', hero);
  const glow = $('.hero__glow--pink', hero);
  if (!frame && !glow) return;

  const target = { rx: 0, ry: 0, gx: 0, gy: 0 };
  const cur = { rx: 0, ry: 0, gx: 0, gy: 0 };
  let raf = 0;
  let heroRect = null;
  let frameRect = null;

  const measure = () => {
    heroRect = hero.getBoundingClientRect();
    frameRect = frame ? frame.getBoundingClientRect() : null;
  };

  const render = () => {
    let moving = false;
    // 틸트는 조금 빠르게, 조명은 느긋하게 따라옴
    cur.rx += (target.rx - cur.rx) * 0.12;
    cur.ry += (target.ry - cur.ry) * 0.12;
    cur.gx += (target.gx - cur.gx) * 0.06;
    cur.gy += (target.gy - cur.gy) * 0.06;
    if (Math.abs(target.rx - cur.rx) + Math.abs(target.ry - cur.ry) > 0.02) moving = true;
    if (Math.abs(target.gx - cur.gx) + Math.abs(target.gy - cur.gy) > 0.2) moving = true;
    if (frame) frame.style.transform = `perspective(1200px) rotateY(${cur.ry.toFixed(2)}deg) rotateX(${cur.rx.toFixed(2)}deg)`;
    if (glow) glow.style.transform = `translate3d(${cur.gx.toFixed(1)}px, ${cur.gy.toFixed(1)}px, 0)`;
    raf = moving ? requestAnimationFrame(render) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(render); };

  hero.addEventListener('pointerenter', measure);
  window.addEventListener('resize', () => { heroRect = null; }, { passive: true });

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!heroRect) measure();
    // 조명: 히어로 안에서의 커서 위치 (-1 ~ 1) → 최대 좌우 180px, 상하 90px
    const nx = clamp(((e.clientX - heroRect.left) / heroRect.width) * 2 - 1, -1, 1);
    const ny = clamp(((e.clientY - heroRect.top) / heroRect.height) * 2 - 1, -1, 1);
    target.gx = nx * 180;
    target.gy = ny * 90;
    // 틸트: 포스터 중심 기준, 포스터 폭 정도 벗어나면 최대 9도
    if (frameRect) {
      const cx = frameRect.left + frameRect.width / 2;
      const cy = frameRect.top + frameRect.height / 2;
      const dx = clamp((e.clientX - cx) / (frameRect.width * 0.9), -1, 1);
      const dy = clamp((e.clientY - cy) / (frameRect.height * 0.9), -1, 1);
      target.ry = dx * 9;
      target.rx = -dy * 9;
    }
    kick();
  });
  hero.addEventListener('pointerleave', () => {
    target.rx = 0; target.ry = 0; target.gx = 0; target.gy = 0;
    kick();
  });
}

/* ---------- 진입 연출 ---------- */
// h1 의 "LIVE / PERFOR / MANCE" 텍스트 노드를 span 으로 감싸 줄 단위로 움직일 수 있게 한다. <br> 구조는 그대로.
function wrapLines(h1) {
  const existing = $$('.hero__line', h1);
  if (existing.length) return existing;
  const out = [];
  Array.from(h1.childNodes).forEach((n) => {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent.trim()) return;
    const s = document.createElement('span');
    s.className = 'hero__line';
    s.textContent = n.textContent.trim();
    h1.replaceChild(s, n);
    out.push(s);
  });
  return out;
}

function runIntro(gsap, hero, done) {
  const html = document.documentElement;
  const h1 = $('.hero__headline h1', hero);
  const lines = h1 ? wrapLines(h1) : [];
  const subs = $$('.hero__headline > p', hero);
  const poster = $('.hero__poster', hero);
  const tonight = $('.hero__tonight', hero);
  const badge = $('.badge', hero);
  const nums = $('.countdown__nums', hero);
  const right = $$('.hero__right > *', hero);
  const eyebrow = $('.hero__eyebrow', hero);
  const ticker = $('.ticker', hero);

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    // 인라인 스크립트의 안전 타이머가 이미 공개해 버렸다면(느린 네트워크) 연출은 건너뛴다 — 보였다 숨겼다 하지 않기
    if (!html.classList.contains('is-intro')) { done(); return; }
    clearTimeout(window.IF_INTRO_T);

    const cp = { clearProps: 'transform,opacity' }; // 끝나면 인라인 스타일 제거 → 스캐폴드 상태로 복귀
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: done });
    if (lines.length) tl.from(lines, { yPercent: 70, opacity: 0, duration: 0.7, stagger: 0.1, ...cp }, 0);
    if (subs.length) tl.from(subs, { y: 16, opacity: 0, duration: 0.5, stagger: 0.08, ...cp }, 0.4);
    if (poster) tl.from(poster, { scale: 0.9, opacity: 0, duration: 0.8, ease: 'power2.out', ...cp }, 0.1);
    if (tonight) tl.from(tonight, { scale: 0, rotation: '-=28', duration: 0.55, ease: 'back.out(2)', ...cp }, 0.6);
    if (badge) tl.from(badge, { scale: 0, rotation: '-=120', duration: 0.6, ease: 'back.out(1.6)', ...cp }, 0.45);
    if (nums) tl.from(nums, { y: 18, opacity: 0, duration: 0.5, ...cp }, 0.6);
    if (right.length) tl.from(right, { y: 18, opacity: 0, duration: 0.5, stagger: 0.06, ...cp }, 0.4);
    if (eyebrow) tl.from(eyebrow, { opacity: 0, duration: 0.5, ...cp }, 0);
    if (ticker) tl.from(ticker, { yPercent: 100, duration: 0.6, ...cp }, 0.5);
    // from() 이 시작 상태를 즉시 그려 놓았으니 이제 CSS 가림막을 걷어도 깜빡이지 않는다
    html.classList.remove('is-intro');
  };

  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, INTRO_FONT_WAIT))]).then(start, start);
}

/* ---------- 스크롤 패럴랙스 ---------- */
function setupParallax(gsap, ST, hero) {
  if (!gsap || !ST) return;
  // 폰에서는 세로로 쌓인 데다 스크롤마다 다시 그려서 화면이 떨립니다.
  // 얻는 것보다 잃는 게 커서 좁은 화면에서는 켜지 않습니다.
  if (window.innerWidth <= 640) return;
  const poster = $('.hero__poster', hero);
  const headline = $('.hero__headline', hero);
  const right = $('.hero__right', hero);
  const tl = gsap.timeline({
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
  });
  if (poster) tl.to(poster, { y: -80, scale: 0.94, ease: 'none' }, 0);
  if (headline) tl.to(headline, { y: 40, ease: 'none' }, 0);
  if (right) tl.to(right, { y: 30, ease: 'none' }, 0);
}
