// 사이트 전체 스크롤 등장 모션
// 마크업 수정 없이 기존 클래스만 선택한다. GSAP ScrollTrigger, once.
// 원칙: 모션은 있으면 좋고 없어도 되는 것 — GSAP 이 없거나 reduced-motion 이면 아무것도 건드리지 않는다.
//       숨긴 요소는 반드시 다시 보이게 한다 (onEnter / onEnterBack / refresh 안전망).
//
// 히어로 아래가 전부 '아래에서 위로 슥' 하나뿐이라 심심했습니다.
// 구역의 성격에 맞춰 등장을 따로 짭니다.
//
//   제목        판이 탁 찍히는 동안 글자가 통째로 바뀌다 점점 느려지며 멎습니다
//   티켓 스텁    발권기에서 인쇄되어 나오듯 위에서 아래로 펼쳐집니다
//   무대 탭      하나씩 통통 튀어 앉습니다
//   곡 목록      왼쪽에서 차례로 밀려 들어옵니다
//   후원사 카드   가로 틈이 위아래로 열리며 가게 불이 켜집니다
//   간판 카드     작게 있다가 탁 커집니다
//   유의사항      카드를 나눠 주듯 기울어진 채 떨어집니다
//   도장         1.5배에서 쿵
import { $$, reducedMotion } from './util.js';
import { scrambleIn } from './decode.js';

const RISE = { y: 24, opacity: 0 };
const EASE = 'power3.out';
const DUR = 0.6;
const CLEAR = 'transform,opacity'; // 끝나면 인라인 스타일 제거 → 순수 CSS 상태로

// 그냥 떠오르기만 하면 되는 것들
const RISERS = ['.notice__contact', '.marquee', '.footer__grid'];

let booted = false;

export function initMotion() {
  if (booted || reducedMotion()) return;
  const go = () => {
    if (booted || !window.gsap || !window.ScrollTrigger) return;
    booted = true;
    // 동적으로 렌더된 .song / .ncard 가 레이아웃까지 끝난 뒤 잡히도록 두 프레임 뒤에
    requestAnimationFrame(() => requestAnimationFrame(setup));
  };
  if (window.gsap && window.ScrollTrigger) go();
  else window.addEventListener('load', go, { once: true });
}

function setup() {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const shown = new WeakSet();
  const hidden = []; // 우리가 숨긴 요소 전부 (안전망 용)
  // ?shot=1 (디렉터 스크린샷 모드) 에서는 아무것도 숨기지 않는다.
  // 등장 경로 자체를 검증하고 싶을 때만 ?shot=1&motion=force
  const force = /[?&]motion=force/.test(location.search);
  if (/[?&]shot/.test(location.search) && !force) return;
  if (/[?&]heat/.test(location.search)) return;   // 관리 화면의 '누른 곳 지도': 늘 다 보이게
  const vh = window.innerHeight;

  // 첫 화면에 이미 보이는 요소는 건드리지 않는다 (보였다 숨겼다 깜빡임 방지). 히어로 안쪽은 hero.js 담당.
  const eligible = (el) => !el.closest('#hero') && (force || el.getBoundingClientRect().top > vh * 0.92);

  // 한 번만 보여 주는 공통 껍데기
  const once = (el, run) => {
    if (shown.has(el)) return;
    shown.add(el);
    run(el);
  };
  const watch = (el, show, start = 'top 88%') => {
    hidden.push({ el, show });
    ScrollTrigger.create({ trigger: el, start, once: true, onEnter: () => show(el), onEnterBack: () => show(el) });
  };

  /* ---------- 구역 머리말: 영문 제목이 한 글자씩 ---------- */
  const headTitle = new WeakMap();
  const headRest = new WeakMap();
  const headRot = new WeakMap();   // 스티커가 CSS 로 기울어져 있어 원래 각도를 기억해 둡니다
  $$('.sec-head').filter(eligible).forEach((head) => {
    const title = head.querySelector('.t-display, .tape');
    const rest = Array.from(head.querySelectorAll('h2, p, .sec-head__right'))
      .filter((n) => n !== title && !n.contains(title));
    headTitle.set(head, title);
    headRest.set(head, rest);
    // 제목은 잠깐 감춰 둡니다 — 미리 보이면 바뀌는 맛이 없습니다.
    // 스티커(INFO·OUR SPONSOR)는 크게 비뚤어진 채로 있다가 제자리에 탁 찍히고,
    // 큰 영문 제목(SETLIST·NOTICE)은 살짝 올라옵니다.
    // 글자가 바뀌는 동안 판 자체도 함께 움직여야 '등장' 으로 읽힙니다.
    if (title && title.classList.contains('tape')) {
      const base = Number(gsap.getProperty(title, 'rotation')) || 0;
      headRot.set(head, base);
      gsap.set(title, { scale: 1.55, rotation: base - 15, opacity: 0, transformOrigin: '50% 50%' });
    } else if (title) {
      gsap.set(title, { y: 22, opacity: 0 });
    }
    if (rest.length) gsap.set(rest, RISE);
    watch(head, showHead, 'top 90%');
  });
  function showHead(head) {
    once(head, () => {
      const title = headTitle.get(head);
      const rest = headRest.get(head) || [];
      if (title) {
        gsap.to(title, title.classList.contains('tape')
          ? { scale: 1, rotation: headRot.get(head) || 0, opacity: 1,
              duration: 0.66, ease: 'back.out(2.6)', overwrite: 'auto', clearProps: CLEAR }
          : { y: 0, opacity: 1, duration: 0.52, ease: 'power3.out', overwrite: 'auto', clearProps: CLEAR });
        scrambleIn(title);
      }
      if (rest.length) {
        gsap.to(rest, { y: 0, opacity: 1, duration: 0.55, ease: EASE, stagger: 0.07,
          delay: 0.22, overwrite: 'auto', clearProps: CLEAR });
      }
    });
  }

  /* ---------- 티켓 스텁: 발권기에서 인쇄되어 나오듯 ----------
     위에서부터 한 줄씩 드러납니다. 늘이거나 줄이지 않아서 글씨가 일그러지지 않습니다.
     그림자는 잘리는 동안만 잠깐 감췄다가 끝나고 되돌립니다. */
  $$('.ticket').filter(eligible).forEach((el) => {
    gsap.set(el, { clipPath: 'inset(0 0 100% 0)', y: -14, boxShadow: 'none' });
    watch(el, (t) => once(t, () => gsap.to(t, {
      clipPath: 'inset(0 0 0% 0)', y: 0, duration: 0.95, ease: 'power2.out',
      overwrite: 'auto', clearProps: 'clipPath,transform,boxShadow',
    })));
  });

  /* ---------- 무대 탭: 하나씩 통통 ---------- */
  const tabs = $$('.setlist__tabs').filter(eligible);
  tabs.forEach((box) => {
    const items = Array.from(box.children);
    gsap.set(items, { y: 26, scale: 0.7, opacity: 0 });
    watch(box, (b) => once(b, () => gsap.to(Array.from(b.children), {
      y: 0, scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.09,
      overwrite: 'auto', clearProps: 'transform,opacity',
    })));
  });

  /* ---------- 곡 목록: 왼쪽에서 차례로 ---------- */
  batch('.song', { x: -34, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.55, ease: 'power3.out', stagger: 0.055 }, 'top 94%');

  /* ---------- 유의사항: 카드를 나눠 주듯 ---------- */
  batch('.ncard', { y: 52, rotation: 3.5, scale: 0.95, opacity: 0 },
    { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.72, ease: 'back.out(1.4)', stagger: 0.1 }, 'top 92%');

  /* ---------- 헤드라인 후원사: 가로 틈이 열리며 가게가 켜집니다 ----------
     가운데 가느다란 틈에서 위아래로 벌어집니다. 오래된 화면이 켜지는 모양입니다.
     그 사이 안쪽 그림은 1.14 배에서 제 크기로 돌아오며 안으로 빨려 들어가듯 앉습니다.
     카드는 transform 을 쓰지 않습니다 — 마우스 기울기(interact.js)가 그 자리를 쓰고 있어서입니다. */
  const shops = $$('.shop').filter(eligible);
  if (shops.length) {
    shops.forEach((el) => {
      const art = el.querySelector('.art');
      gsap.set(el, { clipPath: 'inset(47% 0 47% 0)', opacity: 0, boxShadow: 'none' });
      if (art) gsap.set(art, { scale: 1.14, transformOrigin: '50% 50%' });
    });
    const runShops = (els) => {
      const fresh = els.filter((el) => !shown.has(el));
      fresh.forEach((el) => shown.add(el));
      if (!fresh.length) return;
      gsap.to(fresh, {
        clipPath: 'inset(0% 0 0% 0)', opacity: 1, duration: 0.82, ease: 'power3.out',
        stagger: 0.14, overwrite: 'auto', clearProps: 'clipPath,opacity,boxShadow',
      });
      const arts = fresh.map((el) => el.querySelector('.art')).filter(Boolean);
      if (arts.length) {
        gsap.to(arts, {
          scale: 1, duration: 1.15, ease: 'power3.out', stagger: 0.14,
          overwrite: 'auto', clearProps: 'transform',
        });
      }
    };
    shops.forEach((el) => hidden.push({ el, show: (x) => runShops([x]) }));
    ScrollTrigger.batch(shops, { start: 'top 92%', once: true, onEnter: runShops, onEnterBack: runShops });
  }

  /* ---------- 간판 카드: 작게 있다가 탁 ----------
     명예의 전당 이름(.sp--person)은 뺍니다. 현판에 새긴 이름이 튀어나오면
     가벼워 보입니다. 그대로 놓여 있는 편이 낫습니다. */
  batch('.sp:not(.sp--person)', { scale: 0.78, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.52, ease: 'back.out(1.8)', stagger: 0.04 }, 'top 94%');

  /* ---------- 그냥 떠오르는 것들 ---------- */
  RISERS.forEach((sel) => {
    $$(sel).filter(eligible).forEach((el) => {
      gsap.set(el, RISE);
      watch(el, (t) => once(t, () => gsap.to(t, {
        y: 0, opacity: 1, duration: DUR, ease: EASE, overwrite: 'auto', clearProps: CLEAR,
      })));
    });
  });

  /* ---------- 도장: 1.5배에서 쿵 ---------- */
  $$('.stamp').filter(eligible).forEach((el) => {
    gsap.set(el, { scale: 1.5, opacity: 0 });
    watch(el, (t) => once(t, () => {
      gsap.timeline({ defaults: { overwrite: 'auto' } })
        .to(t, { scale: 1, opacity: 1, duration: 0.42, ease: 'power4.in' })
        .to(t, { rotation: '-=3', duration: 0.07, ease: 'none' })
        .to(t, { rotation: '+=3', duration: 0.22, ease: 'power2.out', clearProps: CLEAR });
    }), 'top 85%');
  });

  /* 목록형: 화면에 들어오는 대로 묶어서 차례대로 */
  function batch(sel, from, to, start) {
    const items = $$(sel).filter(eligible);
    if (!items.length) return;
    gsap.set(items, from);
    const run = (els) => {
      const fresh = els.filter((el) => !shown.has(el));
      fresh.forEach((el) => shown.add(el));
      if (fresh.length) gsap.to(fresh, { ...to, overwrite: 'auto', clearProps: CLEAR });
    };
    items.forEach((el) => hidden.push({ el, show: (x) => run([x]) }));
    ScrollTrigger.batch(items, { start, once: true, onEnter: run, onEnterBack: run });
  }

  // 안전망: 새로고침으로 페이지 중간에서 시작했거나 레이아웃이 바뀌어 이미 지나친 요소는 그냥 보이게.
  // 탭 전환 등으로 DOM 에서 빠진 요소의 트리거는 정리.
  ScrollTrigger.addEventListener('refresh', () => {
    hidden.forEach(({ el, show }) => {
      if (shown.has(el)) return;
      if (!document.contains(el)) { shown.add(el); return; }
      if (el.getBoundingClientRect().bottom < 0) show(el);
    });
    ScrollTrigger.getAll().forEach((t) => { if (t.trigger && t.trigger !== document.body && !document.contains(t.trigger)) t.kill(); });
  });

  // 안전망 2: ScrollTrigger 가 어떤 이유로든 안 울려도, 요소가 화면에 들어온 뒤 0.7초가 지나면 그냥 보이게.
  // (Lenis 와의 스크롤 동기화 실패, 앵커 직행, 탭 전환 중 스크롤 등 예외 상황 대비)
  if ('IntersectionObserver' in window) {
    const byEl = new Map(hidden.map((h) => [h.el, h]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const rec = byEl.get(en.target);
        setTimeout(() => { if (rec && !shown.has(rec.el) && document.contains(rec.el)) rec.show(rec.el); }, 700);
      });
    }, { threshold: 0.05 });
    hidden.forEach(({ el }) => io.observe(el));
  }

  ScrollTrigger.refresh();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  if (document.readyState !== 'complete') window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
