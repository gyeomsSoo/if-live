// 유의사항 카드, 주류 금지 도장, 연락처
import { $, $$, escapeHtml } from './util.js';
import { people, bindContacts, nameSlot, telSlot } from './contact.js';

// '쓸 수 있습니다' 의 '수' 처럼 앞말에 기대는 말은 앞말과 한 덩어리로 줄을 넘깁니다
// (폰에서 '서서 보실' / '수 있습니다' 로 떨어지던 것)
const glue = (s) => escapeHtml(s).replace(/(\S) (수|것|줄|뿐) /g, '$1&nbsp;$2 ')
  // '취소/환불' 처럼 빗금으로 이은 말은 빗금 뒤에서 끊기지 않게 한 덩어리로 넘깁니다
  .replace(/(^|\s)(\S+\/\S+)/g, '$1<span class="nw">$2</span>');
// '[오른쪽|아래]' 처럼 적으면 넓은 화면에선 앞말, 연락처 칸이 아래로 내려가는 폭(1024px 이하)에선 뒷말을 보여 줍니다
const where = (s) => s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, '<span class="dir-wide">$1</span><span class="dir-narrow">$2</span>');

const COLOR = { pink: 'var(--pink)', mint: 'var(--mint)' }; // tokens.css 의 값만 (SVG 는 style= 로 넣어야 var() 가 먹는다)

// 도장에는 번호만 크게 넣습니다.
// 예전에는 영문 두 줄을 욱여넣었는데 폰에서 6px 도 안 돼 아무도 못 읽었습니다.
// icon 이 'id' 인 카드(신분증)는 번호 대신 신분증 그림을 넣습니다.
function stampSvg(no, color, icon) {
  const c = COLOR[color] || COLOR.pink;
  const mid = icon === 'id'
    ? `<g fill="none" style="stroke:${c}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">`
      + `<rect x="21" y="27" width="38" height="27" rx="3.5"/><circle cx="33" cy="38" r="4.2"/>`
      + `<path d="M27 49c1.2-3 3.4-4.6 6-4.6s4.8 1.6 6 4.6"/><path d="M45 37h9M45 44h6"/></g>`
    : `<text x="40" y="53" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="34" style="fill:${c}">${escapeHtml(no || '')}</text>`;
  return `<svg viewBox="0 0 80 80" aria-hidden="true">`
    + `<circle cx="40" cy="40" r="36" fill="none" style="stroke:${c}" stroke-width="3"/>`
    + `<circle cx="40" cy="40" r="29" fill="none" style="stroke:${c}" stroke-width="1.5" stroke-dasharray="3 3"/>`
    + mid + `</svg>`;
}

// 안내 글의 **굵게** — 꼭 챙길 것만 진하게 (신분증 종류)
const bold = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

// 두 번째 도장(신분증)의 글자 앞 그림
const ICON_ID = '<svg class="stamp__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.4 16.2c.6-1.6 1.8-2.4 3.1-2.4s2.5.8 3.1 2.4"/><path d="M14 10h4.5M14 13.5h3"/></svg>';

const ICON_PHONE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
const ICON_COPY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

export function initNotice({ event, notices }) {
  const grid = $('#noticeGrid');
  if (grid) {
    grid.innerHTML = notices.items.map((n) => `
      <article class="card ncard ncard--${escapeHtml(n.color || 'pink')}" id="notice-${escapeHtml(n.id)}">
        ${n.tag ? `<span class="ncard__tag anton">${escapeHtml(n.tag)}</span>` : ''}
        ${stampSvg(n.no, n.color, n.icon)}
        <div class="ncard__body">
          <h3 class="ncard__title">${escapeHtml(n.ko || n.label)}</h3>
          <span class="ncard__en">${escapeHtml(n.label)}</span>
          <p>${where(bold(glue(n.text)))}</p>
        </div>
      </article>`).join('');
  }

  const banner = $('#noticeBanner');
  if (banner && notices.banner) {
    banner.querySelector('.stamp__text').textContent = notices.banner.text;
    banner.querySelector('.stamp__sub').textContent = notices.banner.sub;
  }
  // 두 번째 도장 (신분증). 자료에 없으면 자리째 뺍니다.
  const banner2 = $('#noticeBanner2');
  if (banner2) {
    const b2 = notices.banner2;
    if (b2 && b2.text) {
      banner2.querySelector('.stamp__text').innerHTML = (b2.icon === 'id' ? ICON_ID : '') + escapeHtml(b2.text);
      banner2.querySelector('.stamp__sub').textContent = b2.sub || '';
    } else {
      banner2.remove();
    }
  }

  const intro = $('#contactIntro');
  if (intro) intro.textContent = notices.intro;

  // 이름 · 번호는 크롤러가 못 줍게 가려 두었다가 사람이 화면을 만지면 풉니다 (contact.js).
  // 번호나 '전화·문자' 를 누르면 전화 걸기 · 문자 보내기 · 번호 복사를 고르는 창이 뜹니다.
  const list = $('#contactList');
  if (list) {
    const ppl = people(event);
    list.innerHTML = ppl.map((c, i) => `
      <div class="contact">
        <div class="contact__who"><span class="contact__role" style="background:${i === 0 ? COLOR.pink : COLOR.mint}">${escapeHtml(c.role)}</span><span class="contact__name">${nameSlot(i)}</span></div>
        <div class="contact__row">
          <button class="contact__phone ctel" type="button" data-contact="${i}" data-track="contact:${escapeHtml(c.role)}:번호">${telSlot(i)}</button>
          <div class="contact__btns">
            <button class="sbtn" type="button" data-contact="${i}" data-track="contact:${escapeHtml(c.role)}:전화문자">${ICON_PHONE}전화·문자</button>
            <button class="sbtn" type="button" data-contact="${i}" data-contact-copy data-track="contact:${escapeHtml(c.role)}:복사" aria-label="${escapeHtml(c.role)} 번호 복사">${ICON_COPY}복사</button>
          </div>
        </div>
      </div>`).join('');
    bindContacts(list, ppl);
  }
}
