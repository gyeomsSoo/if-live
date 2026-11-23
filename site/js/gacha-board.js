// 가챠 추첨 큰 화면 (gacha.html). 빔이나 TV 에 이 주소를 띄워 둡니다. 손으로 조작하는 것은 전체 화면 단추뿐입니다.
import { makeClock, fetchState, runDraw, fitGrid, makeTiles, sorted } from './gacha-core.js';

const POLL_MS = 3000;
const BACK_MS = 180000;      // 당첨 화면을 이만큼 보여 준 뒤 번호 받는 화면으로 돌아갑니다

const $ = (s) => document.querySelector(s);
const grid = $('#gbGrid');
const tiles = makeTiles(grid);
const clock = makeClock();
// seen 은 시작 시각으로 잽니다. 연습 뒤 비우면 회차가 다시 1번이 되어 번호로는 새 추첨을 알아볼 수 없습니다.
let mode = 'idle', seen = 0, shownNo = 0, stopRun = null, backTimer = 0, gridN = 0;

function fit(n) {
  gridN = n;
  fitGrid(grid, n, { gap: 10, minFs: 14, maxFs: 64 });
}
window.addEventListener('resize', () => fit(gridN));

function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
}

function paintIdle(d) {
  setMode('idle');
  const nums = d.numbers || [];
  const used = new Set(d.winners.map((w) => w.n));
  const show = nums.filter((n) => !used.has(n));
  grid.hidden = !show.length;          // 칸 크기를 재기 전에 먼저 보여야 합니다
  $('#gbEmpty').hidden = !!show.length;
  tiles.set(show);
  tiles.reset();
  fit(show.length);
  $('#gbCount').textContent = String(show.length);
  const wins = d.winners.filter((w) => !w.void);
  $('#gbPast').hidden = !wins.length;
  $('#gbPast').textContent = wins.length ? '지난 당첨: ' + wins.map((w) => w.n).join(', ') : '';
}

function start(live) {
  seen = live.startAt;
  shownNo = live.no;
  clearTimeout(backTimer);
  if (stopRun) stopRun();
  setMode('run');
  grid.hidden = false;
  $('#gbEmpty').hidden = true;
  tiles.set(sorted(live.order));
  tiles.reset();
  fit(live.order.length);
  let done = false;
  stopRun = runDraw(live, clock, (st) => {
    tiles.off(st.gone);
    $('#gbLeft').textContent = st.before ? String(st.countdown) : String(st.left);
    $('#gbLeftUnit').textContent = st.before ? '초 뒤 시작' : '개 남았습니다';
    $('#gbSay').textContent = st.before ? '곧 시작합니다'
      : st.left <= 2 ? '마지막 둘…'
        : st.left <= 5 ? '거의 다 왔습니다'
          : '내 번호가 켜져 있나요?';
    document.body.classList.toggle('is-last', !st.before && st.left <= 5);
    if (st.done && !done) {
      done = true;
      document.body.classList.remove('is-last');
      tiles.win(st.winner);
      $('#gbWin').textContent = String(st.winner);
      setMode('result');
      backTimer = setTimeout(() => setMode('idle'), BACK_MS);
    }
  });
}

async function poll() {
  try {
    const d = await fetchState(clock, { board: true });
    if (d.live && d.live.startAt !== seen) start(d.live);
    else if (mode === 'idle') paintIdle(d);
    else if (mode === 'result') {
      // 지금 보여 주는 회차가 무효가 되거나 기록이 비워지면 번호 받는 화면으로 돌아갑니다.
      // 맨 끝 줄이 아니라 이 회차를 찾아서 봅니다. 재추첨 직전 응답의 맨 끝 줄은 앞 회차의 무효 기록일 수 있습니다.
      const cur = d.winners.find((w) => w.no === shownNo);
      if (cur ? cur.void : !d.live) { clearTimeout(backTimer); paintIdle(d); }
    }
    $('#gbOff').hidden = true;
  } catch (e) {
    // 서버가 잠깐 끊겨도 도는 추첨은 이미 받은 순서대로 끝까지 갑니다
    $('#gbOff').hidden = mode === 'run';
  }
  setTimeout(poll, POLL_MS);
}

const fsBtn = $('#gbFull');
if (fsBtn) {
  if (!document.documentElement.requestFullscreen) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => { document.documentElement.requestFullscreen().catch(() => {}); });
  document.addEventListener('fullscreenchange', () => { fsBtn.hidden = !!document.fullscreenElement; });
}
setMode('idle');
poll();
