// 온라인 사전 예매 + 마이티켓
// 주소창의 #t=... 이 있으면 그 티켓을 보여주고, 없으면 예매 폼을 보여줍니다.
import { $, $$, escapeHtml, toast, copyText, stat, loadStats } from './util.js';
import { initInteract } from './interact.js';
import { headEnter } from './decode.js';
import { people, bindContacts, nameSlot, telSlot } from './contact.js';

const API = '/api';
const STORE_KEY = 'if.tickets.v1';
const POLL_MS = 20000;

let CFG = null;      // /api/status 응답
let VIEW = null;     // 지금 보고 있는 티켓
let pollTimer = 0;

// ---------------------------------------------------------------- 통신

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(path, body) {
  const opt = body === undefined
    ? { method: 'GET', cache: 'no-store' }
    : { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(API + path, opt);
  let data = {};
  try { data = await res.json(); } catch { /* 본문이 비었을 수도 있습니다 */ }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '지금은 처리할 수 없어요. 잠시 뒤에 다시 시도해 주세요.');
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

// 읽기(GET)만 두 번까지 다시 시도합니다.
// 예매 신청 같은 쓰기(POST)는 두 번 보내면 중복 예매가 되므로 절대 다시 보내지 않습니다.
async function api(path, body) {
  const canRetry = body === undefined;
  for (let i = 0; ; i += 1) {
    try {
      return await once(path, body);
    } catch (e) {
      // 서버가 대답은 했는데 거절한 경우(번호 없음, 마감 등)는 다시 물어도 같습니다
      const answered = typeof e.status === 'number' && e.status > 0;
      if (!canRetry || answered || i >= 2) throw e;
      await wait(400 * (i + 1));
    }
  }
}

// ---------------------------------------------------------------- 이 기기에 저장

function saved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]').filter((t) => t && t.token); }
  catch { return []; }
}

function remember(t) {
  try {
    const list = saved().filter((x) => x.token !== t.token);
    list.unshift({ token: t.token, code: t.code, name: t.name, qty: t.qty });
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 12)));
  } catch { /* 시크릿 모드 등. 저장 못 해도 그냥 넘어갑니다 */ }
}

// 서버에 없는 티켓(지워진 시험 자료 등)은 이 기기 목록에서도 뺍니다. 남겨 두면 눌러도 같은 알림만 납니다.
function forget(token) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(saved().filter((x) => x.token !== token))); }
  catch { /* 저장소를 못 써도 그냥 넘어갑니다 */ }
}

// ---------------------------------------------------------------- 화면 전환

const views = ['vLoading', 'vDown', 'vForm', 'vClosed', 'vTicket'];
function show(id) {
  views.forEach((v) => { const el = $('#' + v); if (el) el.hidden = v !== id; });
  if (id !== 'vTicket') stopPoll();
}

const won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';

function fieldErr(el, msg) {
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = msg;
}

// 새로 예매하러 돌아왔을 때 방금 적은 이름·매수가 남아 있지 않게 비웁니다
function clearForms() {
  ['orderForm', 'findForm', 'findForm2'].forEach((id) => { const f = $('#' + id); if (f) f.reset(); });
  ['formErr', 'findErr', 'findErr2'].forEach((id) => fieldErr($('#' + id), ''));
  syncTotal();
}

// ---------------------------------------------------------------- 예매 폼

function syncTotal() {
  const qty = Math.max(1, Math.min(99, parseInt($('#fQty').value, 10) || 1));
  const price = (CFG && CFG.price) || 5500;
  // 숫자는 Anton, '원' 은 Anton 에 없는 글자라 프리텐다드로 따로 (mobile.css '글꼴 한 벌')
  $('#fTotal').innerHTML = `${(qty * price).toLocaleString('ko-KR')}<span class="won">원</span>`;
  $('#fCalc').textContent = `${won(price)} × ${qty}장`;
}

function initForm() {
  const qtyIn = $('#fQty');
  const step = (d) => {
    qtyIn.value = Math.max(1, Math.min(99, (parseInt(qtyIn.value, 10) || 1) + d));
    syncTotal();
  };
  $('#qtyMinus').addEventListener('click', () => step(-1));
  $('#qtyPlus').addEventListener('click', () => step(1));
  qtyIn.addEventListener('input', syncTotal);
  qtyIn.addEventListener('blur', () => { qtyIn.value = Math.max(1, Math.min(99, parseInt(qtyIn.value, 10) || 1)); syncTotal(); });

  // 방문 통계: 예매 칸에 처음 손댄 순간 한 번 (무엇을 적었는지는 보내지 않습니다)
  const form = $('#orderForm');
  const touched = () => {
    ['focusin', 'input', 'click'].forEach((ev) => form.removeEventListener(ev, touched));
    stat('tk', { a: 'start' });
  };
  ['focusin', 'input', 'click'].forEach((ev) => form.addEventListener(ev, touched));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#orderGo');
    const name = $('#fName').value.trim();
    const qty = Math.max(1, Math.min(99, parseInt($('#fQty').value, 10) || 1));
    fieldErr($('#formErr'), '');
    if (name.length < 1) {
      fieldErr($('#formErr'), '이름을 넣어주세요.');
      $('#fName').focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '예매번호 받는 중…';
    stat('tk', { a: 'submit' });
    try {
      const r = await api('/order', { name, qty }).catch((er) => { stat('tk', { a: 'err' }); throw er; });
      stat('tk', { a: 'ok', qty });
      remember({ ...r.ticket, token: r.token });
      location.hash = 't=' + r.token;
      // 해시가 같으면 hashchange 가 안 오므로 직접 그립니다
      await route(true);
      clearForms();   // 뒤로 가기로 돌아와도 빈 칸이 되게
    } catch (err) {
      fieldErr($('#formErr'), err.message);
      if (err.code === 'closed') setTimeout(boot, 1200);
    } finally {
      btn.disabled = false;
      btn.textContent = '예매번호 받기';
    }
  });
}

// 이름 + 예매번호로 찾기 (폼 화면과 마감 화면 두 곳에 같은 것이 있습니다)
function initFind(formId, nameId, codeId, errId) {
  const form = $('#' + formId);
  if (!form) return;
  const codeEl = $('#' + codeId);
  codeEl.addEventListener('input', () => { codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 4); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#' + errId);
    const name = $('#' + nameId).value.trim();
    const code = codeEl.value.trim();
    fieldErr(err, '');
    if (!name || code.length !== 4) {
      fieldErr(err, '이름과 예매번호 네 자리를 넣어주세요.');
      return;
    }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const r = await api('/lookup', { name, code });
      remember({ ...r.ticket, token: r.token });
      location.hash = 't=' + r.token;
      await route(true);
      clearForms();
    } catch (e2) {
      fieldErr(err, e2.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderSaved(boxId, listId) {
  const box = $('#' + boxId);
  const list = $('#' + listId);
  if (!box || !list) return;
  const items = saved();
  box.hidden = items.length === 0;
  list.innerHTML = items.map((t) => `
    <button class="mine__item" type="button" data-token="${escapeHtml(t.token)}">
      <span class="mine__who">${escapeHtml(t.name || '내 티켓')} · ${escapeHtml(String(t.qty || 1))}장</span>
      <span class="mine__no">NO. ${escapeHtml(t.code || '')}</span>
    </button>`).join('');
  $$('.mine__item', list).forEach((b) => b.addEventListener('click', async () => {
    location.hash = 't=' + b.dataset.token;
    await route(true);
  }));
}

// ---------------------------------------------------------------- 마이티켓

/* 큐알 그리는 코드(57KB)는 티켓을 펼쳤을 때만 씁니다. 표를 사러 온 사람은 쓰지 않으니
   쪽을 열 때 같이 받지 않고, 필요해진 그 자리에서 받습니다. */
let qrLibLoad = null;
function loadQrLib() {
  if (typeof window.qrcode === 'function') return Promise.resolve(true);
  if (!qrLibLoad) {
    qrLibLoad = new Promise((done) => {
      const el = document.createElement('script');
      el.src = 'assets/vendor/qrcode.js';
      el.onload = () => done(typeof window.qrcode === 'function');
      el.onerror = () => { qrLibLoad = null; done(false); };
      document.head.appendChild(el);
    });
  }
  return qrLibLoad;
}

function qrInto(el, text) {
  el.innerHTML = '';
  el.classList.add('is-empty');          // 다 그려질 때까지는 빈 칸을 보이지 않습니다
  el.dataset.qrFor = text;               // 그 사이 다른 티켓으로 넘어갔는지 가릅니다
  if (typeof window.qrcode === 'function') { qrDraw(el, text); return; }
  loadQrLib().then((ok) => {
    if (ok && el.dataset.qrFor === text) qrDraw(el, text);
  });
}

function qrDraw(el, text) {
  try {
    // 0 = 내용 길이에 맞춰 알아서 크기를 고름, M = 중간 정도의 오류 보정
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    el.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="티켓 QR 코드">`
      + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#0E0B0C"/></svg>`;
    el.classList.remove('is-empty');
  } catch {
    el.innerHTML = '';
    el.classList.add('is-empty');
  }
}

const STATE_TEXT = {
  pending: '입금 확인 대기중',
  paid: '입금 확인 완료',
  cancelled: '취소된 예매',
};

// 앞 글자에 받침이 있는지 보고 조사를 골라줍니다. ("이프 와" / "김하늘 과")
function hasBatchim(word) {
  const c = String(word || '').trim().slice(-1);
  if (!c) return false;
  const n = c.charCodeAt(0);
  if (n >= 0xAC00 && n <= 0xD7A3) return (n - 0xAC00) % 28 !== 0;
  // 숫자는 읽는 소리로 판단합니다. 공·삼·육만 받침이 있습니다
  if (c >= '0' && c <= '9') return '036'.includes(c);
  return true;
}
// 받침이 ㄹ 이면 '로', 그 밖의 받침이면 '으로'
function euro(word) {
  const c = String(word || '').trim().slice(-1);
  if (c >= '0' && c <= '9') return '036'.includes(c) ? '으로' : '로';
  const n = c ? c.charCodeAt(0) : 0;
  if (n >= 0xAC00 && n <= 0xD7A3) {
    const b = (n - 0xAC00) % 28;
    return (b === 0 || b === 8) ? '로' : '으로';
  }
  return '으로';
}

function ticketUrl(token) {
  return `${location.origin}/ticket#t=${token}`;
}

function paintTicket(d) {
  const t = d.ticket;
  VIEW = d;
  const band = t.status === 'paid' ? (t.enteredQty || 0) : 0;

  // 상태 배지.  입금 확인 → 밴드 채움  순서대로 바뀝니다.
  const st = $('#mtState');
  let cls = 'is-' + t.status;
  let text = STATE_TEXT[t.status] || t.status;
  if (t.status === 'paid') {
    if (band > 0) { cls = 'is-band'; text = '밴드 착용 완료'; }
    else { cls = 'is-paid'; }
  }
  st.className = 'mt__state ' + cls;
  $('#mtStateText').textContent = text;

  $('#mtName').textContent = t.name;
  $('#mtQty').textContent = t.qty;
  $('#mtCode').textContent = t.code;
  $('#mtAdmit').textContent = t.qty > 1 ? `ADMIT ${t.qty}` : 'ADMIT ONE';
  $('#mtCard').classList.toggle('is-cancelled', t.status === 'cancelled');

  // 밴드를 받았으면 알려 줍니다. 아직이면 굳이 적지 않습니다.
  const used = $('#mtUsed');
  if (band > 0) {
    used.hidden = false;
    used.textContent = t.qty > 1 ? `밴드 ${band}/${t.qty}장 받음` : '밴드 받음';
  } else {
    used.hidden = true;
  }

  // 입금 전에는 계좌 안내를, 입금 뒤에는 QR 을 보여줍니다
  const pay = $('#payBox');
  const qr = $('#mtQr');
  if (t.status === 'pending') {
    pay.hidden = false;
    $('#payBank').textContent = d.bank;
    $('#payAcct').textContent = d.account;
    $('#payHolder').textContent = d.holder;
    // 이름과 예매번호 사이에서만 접힙니다 (번호 네 자리는 쪼개지지 않게)
    const dn = /^(.*\D)(\d{4})$/.exec(String(t.depositName || ''));
    $('#payName').innerHTML = dn ? `${escapeHtml(dn[1])}<wbr><span class="nw">${dn[2]}</span>` : escapeHtml(t.depositName);
    $('#payAmount').textContent = won(t.amount);
    // 보여 줄 때만 'https://' 를 떼고, 주소와 '#t=…' 사이에서 줄을 바꿉니다 (복사 버튼은 전체 주소)
    $('#payUrl').innerHTML = `<span class="nw">${escapeHtml(location.host)}/ticket</span><wbr>`
      + `#t=${escapeHtml(new URLSearchParams(location.hash.slice(1)).get('t') || '')}`;
    $('#keepName').textContent = t.name;
    $('#keepCode').textContent = t.code;
    qr.innerHTML = '';
    qr.classList.add('is-empty');
    // 다른 티켓(입금 확인)을 보다 넘어와도 '이 화면을 보여 주세요' 가 남지 않게
    const cap0 = $('#mtQrCap');
    if (cap0) cap0.hidden = true;
  } else {
    pay.hidden = true;
    const cap = $('#mtQrCap');
    if (t.status === 'paid') {
      qrInto(qr, ticketUrl(new URLSearchParams(location.hash.slice(1)).get('t') || ''));
      if (cap) cap.hidden = false;
    } else {
      qr.innerHTML = ''; qr.classList.add('is-empty');
      if (cap) cap.hidden = true;
    }
  }

  const refresh = $('#mtRefresh');
  if (t.status === 'pending') {
    refresh.textContent = '입금이 확인되면 새로고침 없이 자동으로 처리됩니다.';
  } else {
    refresh.innerHTML = '이 화면을 잃어버려도 이름 '
      + `<b class="hl">${escapeHtml(t.name)}</b>${hasBatchim(t.name) ? '과' : '와'} 예매번호 `
      + `<b class="hl">${escapeHtml(t.code)}</b>${euro(t.code)} 다시 찾을&nbsp;수 있어요.`;
  }

  paintStaff(d);
}

function paintStaff(d) {
  const box = $('#staffBox');
  if (!d.admin) { box.hidden = true; return; }
  const t = d.ticket;
  box.hidden = false;
  const btns = [];
  if (t.status !== 'paid') btns.push(['confirm', '입금 확인 처리', 'go']);
  if (t.status === 'paid') {
    btns.push(['unpay', '입금 확인 되돌리기', 'off']);
  }
  if (t.status !== 'cancelled') btns.push(['cancel', '예매 취소', 'off']);
  else btns.push(['confirm', '취소 되돌리고 입금 확인', 'go']);

  $('#staffBtns').innerHTML = btns.map(([act, label, kind]) =>
    `<button class="staff__btn${kind ? ' staff__btn--' + kind : ''}" type="button" data-act="${act}">${escapeHtml(label)}</button>`).join('');
  $('#staffMsg').textContent = t.status === 'paid'
    ? `${t.qty}장 중 밴드 ${t.enteredQty || 0}장${t.memo ? ' · ' + t.memo : ''}`
    : '입금이 들어왔는지 통장을 확인하고 누르세요.';

  $$('.staff__btn', $('#staffBtns')).forEach((b) => b.addEventListener('click', () => staffDo(b.dataset.act, b)));
}

async function staffDo(act, btn) {
  const t = VIEW.ticket;
  btn.disabled = true;
  try {
    let r;
    if (act === 'confirm') r = await api('/admin/confirm', { code: t.code, status: 'paid' });
    else if (act === 'unpay') r = await api('/admin/confirm', { code: t.code, status: 'pending' });
    else if (act === 'cancel') r = await api('/admin/confirm', { code: t.code, status: 'cancelled' });
    else return;
    paintTicket({ ...VIEW, ticket: r.ticket });
    toast('처리했습니다.');
  } catch (e) {
    toast(e.message, 3200);
  } finally {
    btn.disabled = false;
  }
}

// 티켓의 지금 모습. 이게 달라졌을 때만 다시 그립니다.
const sig = (t) => `${t.status}|${t.enteredQty || 0}`;
// 아직 바뀔 일이 남아 있는가 — 입금을 기다리거나, 밴드를 아직 다 안 받았거나
const watching = (t) => t.status === 'pending'
  || (t.status === 'paid' && (t.enteredQty || 0) < t.qty);

// 화면이 켜져 있을 때만 조용히 다시 물어봅니다
function startPoll(token) {
  stopPoll();
  pollTimer = setInterval(async () => {
    if (document.hidden || !VIEW || !watching(VIEW.ticket)) return;
    try {
      const d = await api('/ticket?token=' + encodeURIComponent(token));
      if (sig(d.ticket) === sig(VIEW.ticket)) return;
      const was = VIEW.ticket;
      paintTicket(d);
      if (d.ticket.status === 'paid' && was.status !== 'paid') {
        toast('입금이 확인되었습니다. 티켓이 준비됐어요!', 3600);
      } else if ((d.ticket.enteredQty || 0) > (was.enteredQty || 0)) {
        toast('밴드 확인됐습니다. 즐거운 공연 되세요!', 3600);
      }
    } catch { /* 잠깐 끊긴 것뿐일 수 있으니 조용히 넘어갑니다 */ }
  }, POLL_MS);
}
function stopPoll() { clearInterval(pollTimer); pollTimer = 0; }

// ---------------------------------------------------------------- 복사 버튼

function initCopy() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b || !VIEW) return;
    const t = VIEW.ticket;
    const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
    const map = {
      acct: String(VIEW.account || '').replace(/\D/g, ''),
      name: t.depositName,
      amount: String(t.amount),
      url: ticketUrl(token),
    };
    const text = map[b.dataset.copy];
    if (!text) return;
    const ok = await copyText(text);
    toast(ok ? '복사했습니다.' : '복사가 안 되네요. 길게 눌러 직접 복사해 주세요.');
    if (ok) {
      const old = b.textContent;
      b.textContent = '복사됨';
      b.classList.add('is-done');
      setTimeout(() => { b.textContent = old; b.classList.remove('is-done'); }, 1600);
    }
  });

  // 이름대로 바로 복사합니다 — 공유 시트를 띄우면 '복사'를 누른 사람이 당황합니다.
  $('#mtShare').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const url = ticketUrl(new URLSearchParams(location.hash.slice(1)).get('t') || '');
    const ok = await copyText(url);
    toast(ok ? '티켓 주소를 복사했습니다.' : '복사가 안 되네요.');
    if (ok) {
      const old = b.textContent;
      b.textContent = '복사됨';
      setTimeout(() => { b.textContent = old; }, 1600);
    }
  });

  $('#mtBack').addEventListener('click', () => { clearForms(); location.hash = ''; route(true); });
}

// ---------------------------------------------------------------- 연락처

function contacts(el) {
  if (!el) return;
  fetch('data/event.json', { cache: 'no-store' })
    .then((r) => r.json())
    .then((ev) => {
      // 한 사람 = 한 덩어리. 전화번호가 '010-' / '1234-5678' 로 끊기지 않게 통째로 다닙니다.
      // 폰에서는 두 사람을 두 줄로 세우고 번호끼리 세로줄을 맞춥니다 (ticket.css .pcs)
      // 이름 · 번호는 사람이 화면을 만진 뒤에만 풀고, 번호를 누르면 전화 · 문자 · 복사 고르는 창 (contact.js)
      const ppl = people(ev);
      el.classList.add('pcs');
      el.innerHTML = ppl.map((c, i) =>
        `<span class="pc"><span class="pc__who">${escapeHtml(c.role)} ${nameSlot(i)}</span> `
        + `<button class="pc__tel ctel" type="button" data-contact="${i}" data-track="contact:${escapeHtml(c.role)}:번호">${telSlot(i)}</button></span>`
      ).join('<span class="pc__sep" aria-hidden="true"> · </span>');
      bindContacts(el, ppl);
    })
    .catch(() => { el.textContent = ''; });
}

// ---------------------------------------------------------------- 길잡이

async function route(force = false) {
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token) {
    if (!force) show('vLoading');
    try {
      const d = await api('/ticket?token=' + encodeURIComponent(token));
      remember({ ...d.ticket, token });
      paintTicket(d);
      show('vTicket');
      // 입금 대기뿐 아니라 입금 완료 뒤 밴드를 아직 다 안 받은 티켓도 지켜봅니다.
      // (예전엔 대기일 때만 켜서, 입구에서 밴드를 채워도 관객 화면은 껐다 켜야 바뀌었습니다)
      if (watching(d.ticket)) startPoll(token);
      else stopPoll();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    } catch (e) {
      if (e.status === 404) {
        forget(token);
        toast('해당 티켓을 찾을 수 없습니다.\n이름과 예매번호로 다시 찾아 주시기 바랍니다.', 3600);
        location.hash = '';
      } else {
        show('vDown');
        return;
      }
    }
  }
  renderSaved('mineBox', 'mineList');
  renderSaved('mineBox2', 'mineList2');
  const open = !!(CFG && CFG.presaleOpen);
  const ht = $('#headTitle');
  const hs = $('#headSub');
  if (ht && hs) {
    ht.textContent = open ? '온라인 사전 예매' : '티켓';
    const he = $('#headEn');
    // 이미 글자가 다 바뀌어 자리잡은 뒤라면 건드리지 않습니다
    if (he && !he.classList.contains('is-decoded')) he.textContent = open ? 'PRESALE' : 'ON SITE';
    hs.innerHTML = open
      ? '계좌로 입금 확인이 되면 해당 화면이 <b>티켓</b>이 됩니다.<br>공연 당일, 검표 부원에게 이 화면을 보여주세요.'
      : '온라인 사전 예매는 마감되었습니다.<br>공연 당일 <b>현장</b>에서 구매하실&nbsp;수 있어요.';
  }
  show(open ? 'vForm' : 'vClosed');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

async function boot() {
  try {
    CFG = await api('/status');
  } catch {
    show('vDown');
    contacts($('#downContacts'));
    return;
  }
  if (CFG.price) $('#pPresale').textContent = '₩' + CFG.price.toLocaleString('ko-KR');
  if (CFG.doorPrice) {
    $('#pDoor').textContent = '₩' + CFG.doorPrice.toLocaleString('ko-KR');
    $('#cDoor').textContent = '₩' + CFG.doorPrice.toLocaleString('ko-KR');
  }
  syncTotal();
  await route();
}

initForm();
initFind('findForm', 'qName', 'qCode', 'findErr');
initFind('findForm2', 'qName2', 'qCode2', 'findErr2');
initCopy();
contacts($('#footContacts'));
contacts($('#downContacts'));
window.addEventListener('hashchange', () => route());
document.addEventListener('visibilitychange', () => {
  // 화면을 다시 켰을 때 입금 확인이 됐는지 한 번 확인합니다
  if (document.hidden || !VIEW || !watching(VIEW.ticket)) return;
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token) api('/ticket?token=' + encodeURIComponent(token)).then((d) => {
    if (sig(d.ticket) !== sig(VIEW.ticket)) paintTicket(d);
  }).catch(() => {});
});
// ?heat=1 (관리 화면의 '누른 곳 지도'): 움직임 없이 처음부터 다 보이게
const HEAT = /[?&]heat/.test(location.search);
if (HEAT) document.documentElement.classList.add('shot', 'heat');
boot();
initInteract();
// 가챠 추첨은 따로 불러옵니다. 여기서 문제가 나도 티켓 화면은 그대로 돌아갑니다.
if (!HEAT) import('./gacha.js').then((m) => m.initGacha()).catch(() => {});
if (!HEAT) headEnter(document.querySelector('.tkhead'));
loadStats();

// 주소에 #t= 가 들어 있으면 티켓을 보러 온 사람입니다.
// 쪽이 다 뜬 뒤 한가한 틈에 큐알 코드를 미리 받아 둡니다 — 펼칠 때 기다리지 않게.
if (/[#&]t=/.test(location.hash)) {
  const warm = () => loadQrLib();
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 2000 });
  else setTimeout(warm, 600);
}
