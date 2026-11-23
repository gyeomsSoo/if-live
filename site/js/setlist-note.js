// 셋리스트가 바뀌었을 때 메인에 한 번 뜨는 안내 창.
//   data/setlist.json 의 update 를 읽어 부마다 추가 · 빠짐 · 순서 바뀜을 보여 줍니다.
//   한 번 띄우면 이 기기에서는 다시 안 뜹니다 (update.id 를 바꾸면 다시 뜸). until 이 지나면 안 뜹니다.
//   이 사이트에 처음 온 사람에게는 '바뀌었다' 는 말이 뜻이 없어서 띄우지 않습니다 (예전에 온 흔적이 있을 때만).
//   주소에 ?setnote=1 을 붙이면 언제든 띄워 봅니다.
import { escapeHtml, openModal, closeModal, reducedMotion } from './util.js';

const KEY = 'if_setnote';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 하는 브라우저 */ } };
// 제목 뒤 괄호(버전 표기)는 창에서는 뺍니다 — 짧게
const short = (t) => String(t).replace(/\s*\([^()]*\)\s*$/, '');

function songs(list, tag) {
  return list.map((t) => `<${tag} class="setnote__song">${escapeHtml(short(t))}</${tag}>`).join('');
}

function html(u) {
  // 모든 부의 순서가 바뀌었으면 맨 위 한 줄로 충분합니다 (부마다 같은 줄을 되풀이하면 창만 길어집니다)
  const allOrder = u.stages.every((s) => s.order);
  const items = u.stages.filter((s) => (s.add || []).length || (s.remove || []).length || s.order).map((s) => {
    const add = (s.add || []).length
      ? `<div class="setnote__row"><span class="setnote__k setnote__k--add">추가</span><span class="setnote__songs">${songs(s.add, 'span')}</span></div>` : '';
    const rem = (s.remove || []).length
      ? `<div class="setnote__row"><span class="setnote__k setnote__k--rem">빠짐</span><span class="setnote__songs">${songs(s.remove, 's')}</span></div>` : '';
    const ord = s.order && (!allOrder || !((s.add || []).length || (s.remove || []).length))
      ? '<div class="setnote__row"><span class="setnote__k">순서</span><span class="setnote__txt">곡 순서가 바뀌었습니다</span></div>' : '';
    return `<li class="setnote__stage"><b class="setnote__label">${escapeHtml(s.label)}</b><div class="setnote__rows">${add}${rem}${ord}</div></li>`;
  }).join('');
  return `
    <div class="setnote">
      <div class="setnote__scroll" data-lenis-prevent>
        <span class="tape tape--pink anton setnote__tape">SETLIST UPDATE</span>
        <h3 class="setnote__title">셋리스트가 바뀌었습니다</h3>
        <p class="setnote__sub">${u.date ? `${escapeHtml(u.date)}에 ` : ''}부별 곡 구성${allOrder ? '과 순서가' : '이'} 바뀌었습니다.</p>
        <ul class="setnote__list">${items}</ul>
      </div>
      <div class="setnote__go"><a class="btn btn--pink" href="#setlist" data-setnote-go data-track="setnote:셋리스트 보기">바뀐 셋리스트 보기</a></div>
    </div>`;
}

// 창이 화면보다 커지지 않게 실제 화면 높이를 CSS 에 알려 줍니다 (앱 안 화면마다 100vh 가 달라 믿을 수 없습니다)
function fitHeight() {
  document.documentElement.style.setProperty('--setnote-vh', `${window.innerHeight}px`);
}

// 안쪽을 더 밀 수 있으면 끝을 흐리게 해서 아래에 더 있다는 걸 알려 줍니다
function paintMore() {
  const box = document.querySelector('#modalBody .setnote__scroll');
  if (box) box.classList.toggle('is-more', box.scrollTop + box.clientHeight < box.scrollHeight - 4);
}

function goSetlist(e) {
  e.preventDefault();
  closeModal();
  const t = document.getElementById('setlist');
  if (!t) return;
  const nav = document.querySelector('.nav');
  const navH = nav ? nav.offsetHeight : 0;
  if (window.lenis && typeof window.lenis.scrollTo === 'function' && !reducedMotion()) window.lenis.scrollTo(t, { offset: -navH });
  else window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - navH, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

// been: 이 기기가 예전에 온 적이 있나 (main.js 가 페이지가 열리는 맨 처음에 재서 넘겨 줍니다)
export function initSetNote({ setlist }, been) {
  const u = setlist && setlist.update;
  if (!u || !u.id || !Array.isArray(u.stages)) return;
  const q = location.search;
  if (!/[?&]setnote=1/.test(q)) {
    if (/shot|heat|diag/.test(q)) return;                       // 화면 찍기 · 열 지도 · 진단
    if (u.until && Date.now() > Date.parse(u.until)) return;      // 공연이 시작되면 그만
    const seen = lsGet(KEY);
    if (seen === u.id) return;
    if (!seen && !been) { lsSet(KEY, u.id); return; }   // 처음 온 사람
  }
  // 첫 화면 연출(약 2.5초)이 끝난 뒤에 띄웁니다
  setTimeout(() => {
    const m = document.getElementById('modal');
    if (!m || !m.hidden) return;              // 다른 창(가게 안내 등)이 떠 있으면 이번엔 건너뜀 — 다음에 뜹니다
    lsSet(KEY, u.id);
    fitHeight();
    openModal(html(u));
    const box = document.querySelector('#modalBody .setnote__scroll');
    if (box) box.addEventListener('scroll', paintMore, { passive: true });
    paintMore();
    window.addEventListener('resize', () => { fitHeight(); paintMore(); }, { passive: true });
    const go = document.querySelector('#modalBody [data-setnote-go]');
    if (go) go.addEventListener('click', goSetlist);
  }, reducedMotion() ? 600 : 2600);
}
