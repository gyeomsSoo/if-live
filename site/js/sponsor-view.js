// 후원사 목록 그리기. 메인 페이지와 후원사 페이지가 같은 코드를 씁니다.
// 등급은 카드 크기와 자리로만 드러냅니다. 금액은 어디에도 쓰지 않습니다.
import { escapeHtml, openModal, closeModal } from './util.js';
import { ART, SIGN } from './shop-art.js';

const PIN = '<svg class="sp__pin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

const STAR = '<svg class="sp__star" width="16" height="16" viewBox="0 0 100 100" aria-hidden="true"><path d="M50,2 L61.8,33.8 L95.6,35.2 L69,56.2 L78.2,88.8 L50,70 L21.8,88.8 L31,56.2 L4.4,35.2 L38.2,33.8 Z" fill="currentColor"/></svg>';

// 네이버 지도에서 찾을 말.
//   search  가게가 알려 준 상호를 그대로 씁니다 (토씨 하나 바꾸지 않습니다)
//   map     주소를 통째로 지정하고 싶을 때
//   둘 다 없으면 '제천 + 매장명'
const searchTerm = (s, city) => s.search || `${city} ${s.name}`;
const mapLink = (s, city) => s.map
  || `https://map.naver.com/p/search/${encodeURIComponent(searchTerm(s, city))}`;
const telHref = (v) => String(v).replace(/[^0-9+]/g, '');

// 포지션은 두 줄로 나눠 놓습니다. LEADER · VICE LEADER 는 이름 위 직함으로,
// 악기는 이름 아래로. 'VICE LEADER · PIANO' 를 한 줄에 두면 폰의 좁은 칸에서
// 아무 데서나 접혀 그 칸만 키가 커지고, 옆 칸 이름과 높이가 어긋났습니다.
// 낱말 하나는 끊기지 않게 묶고, 가운뎃점은 글자가 아니라 간격으로 그립니다.
const isTitle = (part) => /LEADER/i.test(part);
const partsHtml = (parts) => parts
  .map((part) => `<span class="sp__part">${escapeHtml(part)}</span>`)
  .join('<span class="sp__sep" aria-hidden="true">·</span>');
const splitRole = (role) => {
  const parts = String(role || '').split('·').map((p) => p.trim()).filter(Boolean);
  return { title: parts.filter(isTitle), inst: parts.filter((p) => !isTitle(p)) };
};

// 이 페이지에 그려 둔 가게들. 카드를 누르면 여기서 찾아 씁니다.
let ROSTER = [];
let wired = false;

function cardHtml(s, city, idx) {
  // 가게가 아니라 사람이면 지도로 보낼 곳이 없습니다. 링크가 아닌 카드로 둡니다.
  // 직함 줄은 직함이 없어도 비워 둔 채 그립니다 — 칸마다 같은 세 줄이라야
  // 한 줄에 놓인 이름들이 같은 높이에 섭니다.
  if (s.person) {
    const { title, inst } = splitRole(s.role);
    return `<span class="sp sp--person">${STAR}
      <span class="sp__title">${partsHtml(title)}</span>
      <span class="sp__name">${escapeHtml(s.name)}</span>
      <span class="sp__role">${partsHtml(inst)}</span>
    </span>`;
  }
  // 간판을 그려둔 가게는 카드를 간판으로 채웁니다.
  const sign = s.sign && SIGN[s.sign];
  return `
    <a class="sp${sign ? ' sp--sign' : ''}" href="${escapeHtml(mapLink(s, city))}" data-sp="${idx}"
       target="_blank" rel="noopener" aria-label="${escapeHtml(s.name)} 자세히 보기">
      ${sign || STAR}
      ${PIN}
      <span class="sp__name">${escapeHtml(s.name)}</span>
    </a>`;
}

// 헤드라인 후원사 카드. 오른쪽 그림은 shop-art.js 에서 직접 그린 것입니다.
function shopHtml(s, city, idx) {
  const theme = s.theme || '';
  const marks = (s.marks || []).map((x) => `<i>${escapeHtml(x)}</i>`).join('');
  // 이름이 길면 글자를 한 단 줄여 두 줄 안에 앉힙니다.
  const long = s.name.replace(/\s/g, '').length > 7 ? ' shop--longname' : '';
  return `
    <a class="shop shop--${escapeHtml(theme)}${long}" href="${escapeHtml(mapLink(s, city))}" data-sp="${idx}"
       target="_blank" rel="noopener" aria-label="${escapeHtml(s.name)} 자세히 보기">
      <span class="shop__text">
        <span class="shop__badge">HEADLINE</span>
        <span class="shop__name">${escapeHtml(s.name)}</span>
        ${s.tag ? `<span class="shop__tag">${escapeHtml(s.tag)}</span>` : ''}
        ${marks ? `<span class="shop__marks">${marks}</span>` : ''}
        <span class="shop__go">눌러서 자세히</span>
      </span>
      <span class="shop__art">${ART[theme] || ''}</span>
    </a>`;
}

function tierHtml(t, city) {
  const cards = t.sponsors.map((s) => {
    if (s.person) return cardHtml(s, city, -1);
    const idx = ROSTER.push({ ...s, city }) - 1;
    return s.theme ? shopHtml(s, city, idx) : cardHtml(s, city, idx);
  }).join('');
  // label 이 비어 있으면 이름표 없이 앞 묶음에 바로 이어 붙습니다.
  const head = t.label ? `
      <header class="tier__head">
        <span class="tier__label">${escapeHtml(t.label)}</span>
        <span class="tier__ko">${escapeHtml(t.ko || '')}</span>
        ${t.sub ? `<span class="tier__sub">${escapeHtml(t.sub)}</span>` : ''}
        <span class="tier__line" aria-hidden="true"></span>
      </header>` : '';
  return `
    <section class="tier tier--${escapeHtml(t.id)}${head ? '' : ' tier--bare'}">
      ${head}
      <div class="grid">${cards}</div>
    </section>`;
}

/* ---------- 눌렀을 때: 바로 튕겨 나가지 않고 한 번 보여 줍니다 ----------
   지도 앱이 갑자기 열리면 누른 사람이 당황합니다. 어디로 가는지, 전화는 몇 번인지
   먼저 보여 주고 고르게 합니다. data/sponsors.json 의 tel · addr 칸이 있으면
   전화 걸기와 주소도 함께 뜹니다. */
function sheetHtml(s) {
  const marks = (s.marks || []).join(' · ');
  const rows = [
    `<div><dt>찾아가기</dt><dd>${escapeHtml(searchTerm(s, s.city))}</dd></div>`,
    s.addr ? `<div><dt>주소</dt><dd>${escapeHtml(s.addr)}</dd></div>` : '',
    s.tel ? `<div><dt>전화</dt><dd><a href="tel:${escapeHtml(telHref(s.tel))}">${escapeHtml(s.tel)}</a></dd></div>` : '',
  ].join('');
  return `
    <div class="spsheet">
      <span class="spsheet__kind anton">${s.theme ? 'HEADLINE SPONSOR' : 'SPONSOR'}</span>
      <h3 class="spsheet__name">${escapeHtml(s.name)}</h3>
      ${marks ? `<p class="spsheet__marks">${escapeHtml(marks)}</p>` : ''}
      <dl class="spsheet__info">${rows}</dl>
      <div class="spsheet__go">
        <a class="btn btn--pink" href="${escapeHtml(mapLink(s, s.city))}" target="_blank" rel="noopener">네이버 지도로 열기</a>
        ${s.tel ? `<a class="btn btn--ghost" href="tel:${escapeHtml(telHref(s.tel))}">전화 걸기</a>` : ''}
      </div>
      <p class="spsheet__note">새 창(폰에서는 네이버 지도 앱)에서 열립니다.</p>
    </div>`;
}

function wire(box) {
  box.addEventListener('click', (e) => {
    const card = e.target.closest('[data-sp]');
    if (!card || !box.contains(card)) return;
    const s = ROSTER[Number(card.dataset.sp)];
    if (!s) return;            // 못 찾으면 손대지 않습니다 — 원래대로 지도가 열립니다
    e.preventDefault();
    openModal(sheetHtml(s));
  });
  if (wired) return;
  wired = true;
  // 후원사 페이지에는 닫기 배선이 없어서 여기서 함께 걸어 둡니다 (메인은 main.js 가 이미 겁니다).
  document.addEventListener('click', (e) => { if (e.target.closest('#modal [data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

export function renderTiers(box, { event, sponsors }) {
  if (!box) return 0;
  const city = (event && event.venue && event.venue.city) || '제천';
  const tiers = sponsors.tiers || [];
  ROSTER = [];
  box.innerHTML = tiers.map((t) => tierHtml(t, city)).join('');
  wire(box);

  // 명예의 전당 꽃(숨은 재미)은 따로 받아 붙입니다. 못 받아도 목록은 그대로입니다.
  const fame = box.querySelector('.tier--alumni');
  if (fame) import('./hof-flowers.js').then((m) => m.initFlowers(fame)).catch(() => {});

  // count 가 false 인 묶음(I.F 선배님들)은 '함께해 주신 N곳' 숫자에서 뺍니다.
  return tiers.reduce((n, t) => (t.count === false ? n : n + t.sponsors.length), 0);
}
