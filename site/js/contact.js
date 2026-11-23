// 회장 · 부회장 연락처 (메인 CONTACT 카드 · 예매 화면 바닥 · 예매 서버 장애 안내)
//
// 1) 크롤러 막기
//    event.json 에는 이름·번호를 섞은 글자(who)만 있습니다. 화면에는 사람이 실제로 만진 뒤
//    (마우스 움직임 · 터치 · 키 · 휠, 그것도 브라우저가 '진짜'라고 보증한 isTrusted 신호)에만 풀어서 넣습니다.
//    주소를 긁어 가는 수집기는 섞인 글자만 보고, 자바스크립트를 돌리는 검색 로봇도 화면을 만지지는 않아서
//    번호를 못 봅니다. 연락처는 페이지 아래쪽이라 사람은 거기까지 오는 동안 이미 화면을 만집니다.
// 2) 번호를 누르면 '전화 걸기 · 문자 보내기 · 번호 복사' 를 고르는 창이 뜹니다.
//    PC 에서는 tel: 이 아무 일도 안 하는 일이 많아, 휴대폰 카메라로 찍으면 바로 전화가 걸리는 큐알을 같이 보여 줍니다.
//    tel: · sms: 주소도 이 창을 열 때 처음 만들어집니다 (페이지 안에는 없습니다).
//
// 연락처 바꾸는 법 — 브라우저 콘솔에서 아래 한 줄을 돌려 나온 글자를 event.json contacts[].who 에 넣습니다.
//   btoa(String.fromCharCode(...new TextEncoder().encode('홍길동|010-XXXX-XXXX').map((b, i) => b ^ 'if-1992-live'.charCodeAt(i % 12))))
import { escapeHtml, copyText, toast } from './util.js';

const KEY = 'if-1992-live';

function unmix(s) {
  try {
    const raw = atob(String(s));
    const bytes = Uint8Array.from(raw, (ch, i) => ch.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length));
    const [name = '', phone = ''] = new TextDecoder().decode(bytes).split('|');
    return { name, phone };
  } catch {
    return { name: '', phone: '' };
  }
}

/** event.json 의 contacts 를 [{ role, name, phone }] 으로 풉니다. 예전 형식(name · phone 그대로)도 받습니다. */
export function people(event) {
  return ((event && event.contacts) || []).map((c) => ({
    role: c.role || '',
    ...(c.who ? unmix(c.who) : { name: c.name || '', phone: c.phone || '' }),
  }));
}

// ---------------------------------------------------------------- 사람이 만졌는지

const HUMAN_EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'];
let human = false;
const waiting = [];
function onHuman(e) {
  if (human || !e.isTrusted || navigator.webdriver) return;
  human = true;
  HUMAN_EVENTS.forEach((t) => window.removeEventListener(t, onHuman, true));
  waiting.splice(0).forEach((fn) => { try { fn(); } catch { /* 한 곳이 실패해도 나머지는 채웁니다 */ } });
}
HUMAN_EVENTS.forEach((t) => window.addEventListener(t, onHuman, { capture: true, passive: true }));

function whenHuman(fn) { if (human) fn(); else waiting.push(fn); }

// ---------------------------------------------------------------- 그리기

const MASK_NAME = '···';
const MASK_TEL = '010-····-····';

/** 이름 · 번호 자리를 가림막 글자로 그립니다. 사람이 만지면 fill() 이 진짜 값으로 바꿉니다. */
export const nameSlot = (i) => `<span class="cslot" data-c-name="${i}">${MASK_NAME}</span>`;
export const telSlot = (i) => `<span class="cslot" data-c-tel="${i}">${MASK_TEL}</span>`;

/**
 * root 안의 [data-c-name] · [data-c-tel] 을 채우고, [data-contact] 를 누르면 고르는 창을 엽니다.
 * list 는 people() 의 결과입니다.
 */
export function bindContacts(root, list) {
  if (!root) return;
  whenHuman(() => {
    root.querySelectorAll('[data-c-name]').forEach((el) => {
      const p = list[+el.dataset.cName]; if (p) el.textContent = p.name;
    });
    root.querySelectorAll('[data-c-tel]').forEach((el) => {
      const p = list[+el.dataset.cTel]; if (p) el.textContent = p.phone;
    });
    root.classList.add('is-revealed');
  });
  if (root.dataset.contactBound) return;
  root.dataset.contactBound = '1';
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-contact]');
    if (!b || !root.contains(b)) return;
    e.preventDefault();
    const i = +b.dataset.contact;
    if (b.dataset.contactCopy !== undefined) { copyPhone(list[i]); return; }
    if (list[i]) openSheet(list[i], b);
  });
}

async function copyPhone(p) {
  if (!p || !p.phone) return;
  const ok = await copyText(p.phone);
  toast(ok ? `${p.phone} 복사했어요` : '복사에 실패했어요');
}

// ---------------------------------------------------------------- 고르는 창

const ICON = {
  call: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  sms: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>',
  copy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
};

// 문자 앱에 미리 넣어 둘 첫 문장. 아이폰은 '&body=', 나머지는 '?body=' 를 알아듣습니다.
const SMS_BODY = '안녕하세요, I.F 공연 관련해서 문의드립니다.';
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const smsHref = (digits) => `sms:${digits}${IS_IOS ? '&' : '?'}body=${encodeURIComponent(SMS_BODY)}`;

// 마우스로 쓰는 화면(PC)인지. 이때만 큐알을 붙입니다.
const isDesk = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let sheet = null;
let opener = null;

function openSheet(p, from) {
  closeSheet(true);
  opener = from || null;
  const digits = p.phone.replace(/\D/g, '');
  const desk = isDesk();
  const el = document.createElement('div');
  el.className = 'csheet' + (desk ? ' csheet--desk' : '');
  el.innerHTML = `
    <div class="csheet__back" data-x></div>
    <div class="csheet__box" role="dialog" aria-modal="true" aria-labelledby="csheetWho">
      <span class="csheet__grip" aria-hidden="true"></span>
      <button class="csheet__x" type="button" data-x aria-label="닫기">×</button>
      <div class="csheet__head" id="csheetWho">
        <span class="csheet__role">${escapeHtml(p.role)}</span>
        <strong class="csheet__name">${escapeHtml(p.name)}</strong>
      </div>
      <p class="csheet__num">${escapeHtml(p.phone)}</p>
      <div class="csheet__body">
        <div class="csheet__acts">
          <a class="csheet__act csheet__act--call" href="tel:${digits}" data-track="contact:${escapeHtml(p.role)}:전화">${ICON.call}<span>전화 걸기</span></a>
          <a class="csheet__act" href="${smsHref(digits)}" data-track="contact:${escapeHtml(p.role)}:문자">${ICON.sms}<span>문자 보내기</span></a>
          <button class="csheet__act" type="button" data-copy data-track="contact:${escapeHtml(p.role)}:복사">${ICON.copy}<span>번호 복사</span></button>
        </div>
        ${desk ? `<figure class="csheet__qr">
          <div class="csheet__qrimg" aria-hidden="true"></div>
          <figcaption>휴대폰 카메라로 찍으면<br>바로 전화를 걸 수 있어요</figcaption>
        </figure>` : ''}
      </div>
    </div>`;
  document.body.appendChild(el);
  sheet = el;

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { closeSheet(); return; }
    if (e.target.closest('[data-copy]')) { copyPhone(p); return; }
    // 전화 · 문자는 앱으로 넘어가니 창은 닫아 둡니다 (돌아왔을 때 창이 남아 있지 않게)
    if (e.target.closest('.csheet__act')) setTimeout(() => closeSheet(), 300);
  });
  document.addEventListener('keydown', trapKeys);

  if (desk) drawQr(el.querySelector('.csheet__qrimg'), `tel:${digits}`);

  document.documentElement.classList.add('csheet-open');
  if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();
  requestAnimationFrame(() => {
    el.classList.add('is-in');
    const first = el.querySelector('.csheet__act');
    if (first) first.focus({ preventScroll: true });
  });
}

function closeSheet(instant = false) {
  if (!sheet) return;
  const el = sheet;
  sheet = null;
  document.removeEventListener('keydown', trapKeys);
  document.documentElement.classList.remove('csheet-open');
  if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();
  const done = () => el.remove();
  if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
  else { el.classList.remove('is-in'); setTimeout(done, 260); }
  if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  opener = null;
}

function trapKeys(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key !== 'Tab' || !sheet) return;
  const items = [...sheet.querySelectorAll('a[href], button')];
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// 큐알 그리기 — 예매 화면이 쓰는 qrcode.js 를 필요할 때만 받아 옵니다
let qrLoad = null;
function qrLib() {
  if (typeof window.qrcode === 'function') return Promise.resolve(true);
  if (!qrLoad) {
    qrLoad = new Promise((done) => {
      const s = document.createElement('script');
      s.src = 'assets/vendor/qrcode.js';
      s.onload = () => done(typeof window.qrcode === 'function');
      s.onerror = () => { qrLoad = null; done(false); };
      document.head.appendChild(s);
    });
  }
  return qrLoad;
}
function drawQr(box, text) {
  if (!box) return;
  qrLib().then((ok) => {
    if (!ok || !box.isConnected) { box.closest('.csheet__qr')?.remove(); return; }
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
      box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
        + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#0E0B0C"/></svg>`;
    } catch {
      box.closest('.csheet__qr')?.remove();
    }
  });
}
