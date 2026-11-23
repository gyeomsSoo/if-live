// 상단 네비: 스크롤 시 얇아짐, 모바일 메뉴 열림/닫힘, 현재 섹션 표시
import { $, $$, reducedMotion } from './util.js';

const MENU_CLOSE_MS = 320; // hero.css 의 .nav__mobile 트랜지션과 맞춤

export function initNav() {
  const nav = $('.nav');
  const burger = $('.nav__burger');
  const menu = $('#mobileMenu');

  // ----- 모바일 메뉴 -----
  if (burger && menu) {
    let closeTimer = 0;
    const isOpen = () => !menu.hidden && menu.classList.contains('is-open');
    const setOpen = (open) => {
      clearTimeout(closeTimer);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      burger.classList.toggle('is-open', open);
      if (open) {
        menu.hidden = false;
        void menu.offsetHeight; // display 전환 직후 트랜지션이 걸리도록 한 번 리플로우
        menu.classList.add('is-open');
      } else {
        menu.classList.remove('is-open');
        if (reducedMotion()) menu.hidden = true;
        else closeTimer = setTimeout(() => { menu.hidden = true; }, MENU_CLOSE_MS);
      }
    };
    // 메뉴 항목을 누르면 곧바로 사라지게 합니다.
    // 부드러운 스크롤이 1초 넘게 이어지는데 메뉴가 천천히 접히면
    // "안 접힌 채로 화면이 움직이는" 것처럼 보입니다.
    const closeNow = () => {
      clearTimeout(closeTimer);
      menu.classList.remove('is-open');
      menu.hidden = true;
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '메뉴 열기');
    };

    burger.addEventListener('click', () => setOpen(!isOpen()));
    $$('a', menu).forEach((a) => a.addEventListener('click', closeNow));
    // 어떤 이유로든 화면이 움직이기 시작하면 메뉴는 닫습니다.
    window.addEventListener('scroll', () => { if (isOpen()) closeNow(); }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); burger.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (isOpen() && nav && !nav.contains(e.target)) setOpen(false);
    });
    window.addEventListener('resize', () => { if (isOpen() && window.innerWidth > 1024) setOpen(false); }, { passive: true });
  }

  // ----- 스크롤이 시작되면 얇아짐 (히스테리시스로 경계에서 떨림 방지) -----
  if (nav) {
    let scrolled = false;
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (!scrolled && y > 48) { scrolled = true; nav.classList.add('is-scrolled'); }
      else if (scrolled && y < 8) { scrolled = false; nav.classList.remove('is-scrolled'); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ----- 스크롤 위치에 따라 메뉴 강조 -----
  const links = $$('.nav__link');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${en.target.id}`));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach((s) => io.observe(s));
  }
}
