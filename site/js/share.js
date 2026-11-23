// 공유: 기기 공유 시트(카카오톡 포함) / 링크 복사 / 인스타 링크 / 맨 위로 버튼
import { $, copyText, toast, reducedMotion, stat } from './util.js';

const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V6"/><path d="M5 12l7-7 7 7"/></svg>';

// 우하단 "맨 위로" 원형 버튼: 마크업은 여기서 만들어 body 끝에 붙인다 (400px 넘게 내려가면 등장)
function initToTop() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'totop';
  btn.setAttribute('aria-label', '맨 위로');
  btn.innerHTML = ICON_UP;
  document.body.appendChild(btn);

  let ticking = false;
  const update = () => { ticking = false; btn.classList.toggle('is-visible', window.scrollY > 400); };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
  if (document.documentElement.classList.contains('shot')) btn.classList.add('is-visible'); // 스크린샷 확인용

  btn.addEventListener('click', () => {
    const lenis = window.lenis; // 에이전트 A 가 전역으로 노출하면 그걸로
    if (lenis && typeof lenis.scrollTo === 'function' && !reducedMotion()) { lenis.scrollTo(0); return; }
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
}

// 링크 복사 알림. 붙여넣기 단축키는 키보드·마우스가 있는 기기에서만 알려 줍니다 (폰에는 Ctrl+V 가 없습니다)
function copiedMsg() {
  const desk = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const key = !desk ? '' : /Mac/.test(navigator.userAgent) ? '(⌘+V)' : '(Ctrl+V)';
  return `링크가 복사되었습니다.\n원하는 곳에 붙여넣기${key}해주세요.`;
}

export function initShare({ event }) {
  const url = event.site.url || location.href;
  const insta = $('#instaLink');
  if (insta) insta.href = `https://www.instagram.com/${event.instagram}/`;

  const share = $('#btnShare');
  if (share) {
    share.addEventListener('click', async () => {
      const payload = { title: event.site.title, text: event.site.description, url };
      if (navigator.share) {
        try { await navigator.share(payload); stat('share', { how: 'native' }); return; }
        catch (err) { if (err && err.name === 'AbortError') return; /* 사용자가 취소 */ }
        // 공유 시트를 못 띄우면 아래 링크 복사로
      }
      const ok = await copyText(url);
      if (ok) stat('share', { how: 'copy' });
      toast(ok ? copiedMsg() : '복사에 실패했어요', 3200);
    });
  }

  const copy = $('#btnCopy');
  if (copy) {
    copy.addEventListener('click', async () => {
      const ok = await copyText(url);
      if (ok) stat('share', { how: 'copy' });
      toast(ok ? copiedMsg() : '복사에 실패했어요', 3200);
    });
  }

  initToTop();
}
