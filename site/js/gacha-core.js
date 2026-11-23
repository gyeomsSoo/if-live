// 가챠 추첨 공통: 서버 시계 맞추기, 탈락 순서 돌리기, 번호판 칸 크기 맞추기.
// 큰 화면(gacha.html)과 티켓 페이지가 함께 씁니다. 화면을 계속 그리는 고리(rAF)는 쓰지 않습니다.

export function makeClock() {
  let off = 0, best = Infinity;
  return {
    // 왕복이 가장 짧았던 응답을 믿습니다. 오래된 표본은 조금씩 믿음을 잃습니다.
    note(serverNow, sent, got) {
      const rtt = Math.max(0, got - sent);
      best += 30;
      if (rtt <= best) { best = rtt; off = serverNow + rtt / 2 - got; }
    },
    now: () => Date.now() + off,
  };
}

export async function fetchState(clock, { board = false, id = '' } = {}) {
  const q = [];
  if (board) q.push('board=1');
  if (id) q.push('id=' + encodeURIComponent(id));
  // 응답이 멈춰 있으면 8초 뒤 끊고 다시 묻습니다. 기다리기만 하면 그사이 추첨을 놓칩니다.
  const ctl = new AbortController();
  const limit = setTimeout(() => ctl.abort(), 8000);
  try {
    const sent = Date.now();
    const r = await fetch('/api/gacha' + (q.length ? '?' + q.join('&') : ''), { cache: 'no-store', signal: ctl.signal });
    const got = Date.now();
    if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
    const d = await r.json();
    clock.note(d.now, sent, got);
    return d;
  } finally {
    clearTimeout(limit);
  }
}

// 서버 시계 기준으로 지금 어디까지 왔는지 계산해 cb 로 알려 줍니다. 늦게 받은 화면은 바로 그 지점으로 맞춰집니다.
export function runDraw(live, clock, cb) {
  const { order, steps, dur, startAt } = live;
  const winner = order[order.length - 1];
  let timer = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    const el = clock.now() - startAt;
    let out = 0, next = null;
    for (const [t, k] of steps) {
      if (t <= el) out += k;
      else { next = t; break; }
    }
    const done = el >= dur;
    cb({
      before: el < 0, countdown: el < 0 ? Math.ceil(-el / 1000) : 0,
      gone: order.slice(0, out), left: order.length - out, total: order.length,
      winner: done ? winner : null, done,
    });
    if (done) return;
    let wait;
    if (el < 0) wait = (-el % 1000) || 1000;     // 초읽기는 1초마다
    else wait = (next === null ? dur : next) - el;
    timer = setTimeout(tick, Math.max(wait, 20));
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); };
}

// 칸 수에 맞춰 글자가 가장 크게 나오는 줄 수를 고릅니다. 글자는 최소 minFs, 안 들어가면 번호판 안에서 밀어 보게 됩니다.
export function fitGrid(grid, n, { gap = 8, minFs = 14, maxFs = 64 } = {}) {
  const W = grid.clientWidth, H = grid.clientHeight;
  const count = Math.max(n, 1);
  let best = null;
  for (let c = 1; c <= Math.min(count, 24); c++) {
    const rows = Math.ceil(count / c);
    const w = (W - gap * (c - 1)) / c;
    const h = (H - gap * (rows - 1)) / rows;
    if (w <= 0 || h <= 0) continue;
    const tileH = Math.min(h, w * 0.8);
    const fs = Math.min(w * 0.4, tileH * 0.62, maxFs);
    if (!best || fs > best.fs) best = { c, fs, tileH };
  }
  if (!best || best.fs < minFs) {
    const c = Math.max(1, Math.floor((W + gap) / (minFs * 3.2 + gap)));
    best = { c, fs: minFs, tileH: minFs * 2 };
  }
  grid.style.setProperty('--gx-cols', best.c);
  grid.style.setProperty('--gx-fs', best.fs.toFixed(1) + 'px');
  grid.style.setProperty('--gx-h', best.tileH.toFixed(1) + 'px');
  grid.style.setProperty('--gx-gap', gap + 'px');
}

// 번호판 칸들. 바뀐 칸만 고칩니다.
export function makeTiles(grid) {
  const map = new Map();
  return {
    set(nums) {
      const same = nums.length === map.size && nums.every((n) => map.has(n));
      if (same) return;
      const keep = new Map();
      nums.forEach((n) => {
        let el = map.get(n);
        if (!el) {
          el = document.createElement('span');
          el.className = 'gxt';
          el.textContent = String(n);
        }
        keep.set(n, el);
      });
      map.clear();
      keep.forEach((el, n) => map.set(n, el));
      grid.textContent = '';
      keep.forEach((el) => grid.appendChild(el));
    },
    reset() { map.forEach((el) => { el.className = 'gxt'; }); },
    off(list) { list.forEach((n) => { const el = map.get(n); if (el) el.classList.add('is-off'); }); },
    win(n) { const el = map.get(n); if (el) el.classList.add('is-win'); },
    // 내 번호를 표시하고, 번호판을 밀어 봐야 할 만큼 길면 내 번호가 보이는 곳으로 옮겨 둡니다
    mine(n) {
      const el = map.get(n);
      if (!el) return;
      el.classList.add('is-mine');
      grid.scrollTop = Math.max(0, el.offsetTop - grid.clientHeight / 2);
    },
    has: (n) => map.has(n),
  };
}

export const sorted = (nums) => nums.slice().sort((a, b) => a - b);
