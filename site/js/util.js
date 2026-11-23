// 공용 도우미
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* 화면에 들어오면 한 번만 부릅니다.
   관찰자를 먼저 걸되, 위치를 직접 재는 안전망을 함께 둡니다 —
   인앱 브라우저나 배경 탭에서는 관찰자가 울리지 않는 일이 있습니다. */
export function onceInView(els, fn, margin = 0.12) {
  const list = Array.from(els || []);
  if (!list.length) return () => {};
  const pending = new Set(list);
  const fire = (el) => {
    if (!pending.has(el)) return;
    pending.delete(el);
    fn(el);
  };
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        fire(e.target);
      });
    }, { threshold: 0.15 });
    list.forEach((el) => io.observe(el));
  }
  const check = () => {
    if (!pending.size) return;
    const h = window.innerHeight;
    Array.from(pending).forEach((el) => {
      if (!document.contains(el)) { pending.delete(el); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h * (1 - margin)) fire(el);
    });
  };
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check, { passive: true });
  const timer = setTimeout(check, 80);
  // 목록이 통째로 갈릴 때(탭 전환) 정리할 수 있도록 되돌려 줍니다
  return () => {
    clearTimeout(timer);
    pending.clear();
    if (io) io.disconnect();
    window.removeEventListener('scroll', check);
    window.removeEventListener('resize', check);
  };
}

let modalOpener = null;   // 창을 열기 직전에 포커스가 있던 곳 (닫으면 돌아갑니다)
export function openModal(html) {
  const m = $('#modal'); const body = $('#modalBody');
  if (!m || !body) return;
  body.innerHTML = html;
  m.hidden = false;
  document.body.style.overflow = 'hidden';
  // Lenis 는 body overflow:hidden 을 무시하고 휠로 뒤 페이지를 굴리므로 직접 멈춘다 (hero.js 가 window.lenis 로 노출)
  if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();
  // 키보드 · 스크린리더: 창 안으로 들어가고, Tab 은 창 안에서만 돌고, 닫으면 누른 자리로 돌아갑니다
  // (연락처 창 js/contact.js 와 같은 방식. 마우스 · 손가락으로 열면 포커스 테두리는 보이지 않습니다)
  modalOpener = document.activeElement;
  document.addEventListener('keydown', trapModal);
  const first = $('a[href], button', body) || $('.modal__close', m);
  if (first) first.focus({ preventScroll: true });
}
export function closeModal() {
  const m = $('#modal');
  if (!m || m.hidden) return;
  m.hidden = true;
  document.body.style.overflow = '';
  if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();
  document.removeEventListener('keydown', trapModal);
  if (modalOpener && document.contains(modalOpener)) modalOpener.focus({ preventScroll: true });
  modalOpener = null;
}
function trapModal(e) {
  const m = $('#modal');
  if (e.key !== 'Tab' || !m || m.hidden) return;
  const items = $$('a[href], button', m);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first) return;
  if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* 방문 통계(js/stats.js)는 쪽이 다 뜨고 한가할 때 따로 받습니다. 못 받아도 사이트는 그대로입니다. */
export function loadStats() {
  try {
    const go = () => { import('./stats.js').catch(() => {}); };
    const idle = () => { if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 5000 }); else setTimeout(go, 1500); };
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
  } catch (e) { /* 무시 */ }
}

/* 통계에 알립니다: stat('song' | 'tk' | 'share' | 'err', {...}).  err 는 관리 화면 '오류' 로 갑니다.
   stats.js 가 아직 안 왔으면 잠깐 모아 두고, 꺼져 있거나 막혔으면 아무 일도 없습니다. */
export function stat(t, data) {
  try {
    if (typeof window.IFT === 'function') window.IFT(t, data);
    else if (window.IFQ !== null) {
      const q = (window.IFQ = window.IFQ || []);
      if (q.length < 30) q.push([t, data, Date.now()]);
    }
  } catch (e) { /* 무시 */ }
}

// 두 자리 숫자
export const pad2 =(n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

// "HH:MM" + 기준 날짜(YYYY-MM-DD) → Date (한국 시간). 자정 넘김(00:00~05:59)은 다음 날로 처리
export function stageTime(dateStr, hhmm, isEnd = false) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const dayOffset = h < 6 || (isEnd && h === 0 && m === 0) ? 1 : 0;
  d.setTime(d.getTime() + ((dayOffset * 24 + h) * 60 + m) * 60 * 1000);
  return d;
}
