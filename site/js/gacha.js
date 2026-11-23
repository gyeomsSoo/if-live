// 티켓 페이지의 가챠 추첨: 공연 중에만 번호 입력 칸이 열리고, 추첨이 시작되면 화면 가득 번호판이 나옵니다.
// ticket.js 가 따로 불러옵니다. 여기서 문제가 나도 티켓 화면은 그대로 돌아갑니다.
import { makeClock, fetchState, runDraw, fitGrid, makeTiles, sorted } from './gacha-core.js';

const POLL_MS = 3000;
const KEY_ID = 'if.gacha.id';

const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막혀도 이번 화면에서는 동작합니다 */ } };

let memId = '';
function deviceId(create) {
  let id = memId || lsGet(KEY_ID);
  if (!id && create) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    id = Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('');
    lsSet(KEY_ID, id);
  }
  memId = id;
  return id;
}

export function initGacha() {
  const panel = document.querySelector('#gxPanel');
  if (!panel) return;
  const $ = (s) => panel.querySelector(s);
  const form = $('#gxForm'), waitBox = $('#gxWait'), input = $('#gxNum'), errEl = $('#gxErr');
  const clock = makeClock();
  // seen 은 시작 시각으로 잽니다. 연습 뒤 비우면 회차가 다시 1번이 되어 번호로는 새 추첨을 알아볼 수 없습니다.
  let timer = 0, stopRun = null, seen = 0, shownNo = 0, mine = null, lastState = null, editing = false, ended = false;

  // 마이티켓을 보고 있으면 입장 QR 이 밀리지 않게 티켓 아래로, 아니면 맨 위로 옮깁니다.
  const vTicket = document.querySelector('#vTicket');
  const place = () => {
    const onTicket = vTicket && !vTicket.hidden;
    // 스태프 칸(관리자 기기에서만 보임) 뒤에 둡니다. 입금 확인 단추도 밀리면 안 됩니다.
    const card = onTicket && (vTicket.querySelector('#staffBox') || vTicket.querySelector('#mtCard'));
    if (card) { card.insertAdjacentElement('afterend', panel); panel.classList.remove('wrap'); }
    else {
      const head = document.querySelector('.tkhead');
      if (head && head.nextElementSibling !== panel) head.insertAdjacentElement('afterend', panel);
      panel.classList.add('wrap');
    }
  };
  if (vTicket) new MutationObserver(place).observe(vTicket, { attributes: true, attributeFilter: ['hidden'] });
  place();

  // ---------------------------------------------------------------- 칸 그리기
  function paintPanel(d) {
    const open = d.open || d.admin;
    panel.hidden = !open;
    $('#gxPrac').hidden = d.open || !d.admin;
    if ('mine' in d) mine = d.mine;
    const joined = mine !== null && !editing;
    form.hidden = joined;
    waitBox.hidden = !joined;
    if (joined) $('#gxMine').textContent = String(mine);
    const wins = d.winners.filter((w) => !w.void);
    const mineWon = joined && wins.some((w) => w.n === mine);
    $('#gxWaitSay').textContent = mineWon
      ? '당첨된 번호입니다! 티켓을 들고 무대 앞으로 와 주세요.'
      : '추첨을 기다리는 중입니다. 시작되면 이 화면에서 바로 나옵니다.';
    const box = $('#gxWins');
    box.hidden = !wins.length;
    box.textContent = wins.length ? '당첨 번호: ' + wins.map((w) => w.n).join(', ') : '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    const fail = (m) => { errEl.textContent = m; errEl.hidden = false; };
    if (!/^\d{1,4}$/.test(raw)) { fail('티켓에 적힌 번호를 넣어 주세요.'); return; }
    errEl.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await fetch('/api/gacha/enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: raw, id: deviceId(true) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fail(j.error || '잠시 뒤에 다시 눌러 주세요.'); return; }
      mine = j.n;
      editing = false;
      input.value = '';
      if (lastState) paintPanel({ ...lastState, mine });
    } catch {
      fail('인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally {
      btn.disabled = false;
    }
  });
  $('#gxEdit').addEventListener('click', () => {
    editing = true;
    form.hidden = false;
    waitBox.hidden = true;
    input.value = mine === null ? '' : String(mine);
    input.focus();
  });

  // ---------------------------------------------------------------- 추첨 화면
  let stage = null;
  function buildStage() {
    const el = document.createElement('div');
    el.className = 'gxs';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '가챠 추첨');
    el.innerHTML = `
      <button class="gxs__x" type="button">닫기</button>
      <div class="gxs__run">
        <p class="gxs__mine"></p>
        <p class="gxs__say" aria-live="polite"></p>
        <div class="gxs__count"><b></b><span></span></div>
        <div class="gxs__grid gxgrid" data-lenis-prevent></div>
      </div>
      <div class="gxs__res" hidden>
        <div class="gxs__conf" aria-hidden="true"></div>
        <h2 class="gxs__rt"></h2>
        <p class="gxs__rl"></p>
        <div class="gxs__rn anton"></div>
        <p class="gxs__rm"></p>
        <p class="gxs__rs"></p>
      </div>`;
    document.body.appendChild(el);
    const tiles = makeTiles(el.querySelector('.gxs__grid'));
    el.querySelector('.gxs__x').addEventListener('click', () => closeStage());
    window.addEventListener('resize', () => {
      if (!el.hidden && stage.n) fitGrid(el.querySelector('.gxs__grid'), stage.n, { gap: 6, maxFs: 40 });
    });
    return { el, tiles, n: 0 };
  }
  function closeStage() {
    if (!stage) return;
    stage.el.hidden = true;
    document.documentElement.classList.remove('gx-lock');
  }

  function showResult(winner) {
    const s = stage.el;
    const won = mine !== null && mine === winner;
    s.classList.toggle('is-win', won);
    s.querySelector('.gxs__run').hidden = true;
    s.querySelector('.gxs__res').hidden = false;
    s.querySelector('.gxs__rt').textContent = won ? '당첨!' : '';
    s.querySelector('.gxs__rt').hidden = !won;
    s.querySelector('.gxs__rl').textContent = won ? '내 번호' : '당첨 번호';
    s.querySelector('.gxs__rn').textContent = String(winner);
    const rm = s.querySelector('.gxs__rm');
    rm.hidden = won || mine === null;
    rm.textContent = mine === null ? '' : '내 번호 ' + mine;
    s.querySelector('.gxs__rs').textContent = won
      ? '티켓을 들고 무대 앞으로 와 주세요. 티켓에 적힌 번호를 스태프가 확인합니다.'
      : mine === null
        ? '이 번호가 적힌 티켓을 가지신 분은 무대 앞으로 와 주세요.'
        : '이번엔 아쉽습니다. 다음 추첨을 기다려 주세요.';
    const conf = s.querySelector('.gxs__conf');
    conf.textContent = '';
    if (won) {
      for (let i = 0; i < 18; i++) {
        const c = document.createElement('i');
        c.style.left = ((i * 41 + (i % 4) * 53) % 100) + '%';
        c.style.animationDelay = (-(i % 10) * 0.26).toFixed(2) + 's';
        c.dataset.c = String(i % 3);
        conf.appendChild(c);
      }
      if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch { /* 없어도 그만입니다 */ } }
    }
  }

  function startRun(live) {
    seen = live.startAt;
    shownNo = live.no;
    if (stopRun) stopRun();
    clearTimeout(timer);
    if (!stage) stage = buildStage();
    const s = stage.el;
    const grid = s.querySelector('.gxs__grid');
    s.classList.remove('is-win');
    s.querySelector('.gxs__run').hidden = false;
    s.querySelector('.gxs__res').hidden = true;
    s.hidden = false;
    document.documentElement.classList.add('gx-lock');
    stage.n = live.order.length;
    stage.tiles.set(sorted(live.order));
    stage.tiles.reset();
    const inPool = mine !== null && stage.tiles.has(mine);
    const mineEl = s.querySelector('.gxs__mine');
    mineEl.textContent = mine === null ? '번호를 넣지 않아 구경 중입니다' : '내 번호 ' + mine;
    const say = s.querySelector('.gxs__say'), countN = s.querySelector('.gxs__count b'), countU = s.querySelector('.gxs__count span');
    let result = false;
    stopRun = runDraw(live, clock, (st) => {
      stage.tiles.off(st.gone);
      countN.textContent = String(st.before ? st.countdown : st.left);
      countU.textContent = st.before ? '초 뒤 시작' : '개 남음';
      if (st.before) say.textContent = '곧 시작합니다';
      else if (mine !== null && !inPool) say.textContent = '내 번호는 이번 추첨 범위에 없습니다';
      else if (inPool && st.gone.includes(mine)) say.textContent = '내 번호가 꺼졌습니다';
      else if (st.left <= 2) say.textContent = inPool ? '내 번호가 마지막 둘 안에 있습니다!' : '마지막 둘…';
      else say.textContent = inPool ? '내 번호가 아직 켜져 있습니다!' : '누가 남을까요?';
      if (st.done && !result) {
        result = true;
        stage.tiles.win(st.winner);
        setTimeout(() => { if (seen === live.startAt) showResult(st.winner); }, 900);
        schedule(1500);
      }
    });
    // 위 첫 호출로 글자가 채워진 뒤에 재야 번호판 자리가 정확합니다
    fitGrid(grid, stage.n, { gap: 6, maxFs: 40 });
    if (inPool) stage.tiles.mine(mine);
  }

  // ---------------------------------------------------------------- 서버 상태 받기
  function schedule(ms) {
    clearTimeout(timer);
    if (!ended) timer = setTimeout(poll, ms);
  }
  async function poll() {
    if (document.hidden) return;      // 다시 켜면 visibilitychange 에서 이어 갑니다
    let d;
    try {
      d = await fetchState(clock, { id: deviceId(false) });
    } catch (e) {
      schedule(e.status === 404 ? 60000 : 5000);
      return;
    }
    lastState = d;
    paintPanel(d);
    if (d.live && d.live.startAt !== seen && (d.open || d.admin)) {
      try { startRun(d.live); } catch { schedule(POLL_MS); }   // 그리다 실패해도 묻기는 멈추지 않습니다
      return;
    }
    // 보고 있는 당첨이 무효가 되거나 기록이 비워지면 당첨 화면을 닫습니다
    if (stage && !stage.el.hidden) {
      const w = d.winners.find((x) => x.no === shownNo);
      if (w ? w.void : !d.live) closeStage();
    }
    if (d.open || d.admin) { schedule(POLL_MS + Math.random() * 800); return; }
    // 아직 시간이 아니면 열릴 때 맞춰 다시 봅니다. 끝났으면 더 묻지 않습니다.
    const t = clock.now();
    const openAt = Date.parse(d.openAt), closeAt = Date.parse(d.closeAt);
    if (t >= closeAt) { ended = true; return; }
    schedule(Math.min(Math.max(openAt - t, 0) + Math.random() * 5000, 600000));
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !ended) { clearTimeout(timer); poll(); }
  });
  poll();
}
