// ============================================================
// player.js — 셋리스트 하이라이트 재생기
//
// 곡 줄을 누르면 그 줄 바로 아래로 작은 재생기가 펼쳐집니다
// (예전에 유튜브 창이 열리던 자리). 재생/멈춤 단추, 진행 막대, 시간.
// 멤버들이 잘라 둔 하이라이트 클립(20~50초)을 들려주고, 처음은 짧게(0.3초) 차오르고
// 끝은 서서히 잦아들다 멎습니다.
//
// 소리 크기는 Web Audio 로 조절합니다. 아이폰은 <audio> 의 volume 을 바꿀 수 없어서
// (늘 1) 그 방법으로는 페이드가 먹지 않습니다. Web Audio 를 거치면 아이폰에서도
// 부드럽게 오르내립니다. 다만 아이폰은 Web Audio 소리를 무음 스위치로 끄므로
// navigator.audioSession 으로 '음악 재생' 이라고 알려 둡니다. 그 기능이 없는 옛
// 아이폰은 Web Audio 를 거치지 않고 그냥 틉니다 (페이드는 없지만 소리는 납니다).
//
// 쓰는 쪽(setlist.js)은 play(곡, 재생기를 넣을 칸) · stop() 만 부르면 됩니다.
// ============================================================
import { stat } from './util.js';

const FADE_IN = 0.3;      // 곡 처음 (초). 길면 누른 뒤 한참 작게 들려 늦게 나오는 것처럼 느껴집니다
const FADE_OUT = 1.8;     // 곡 끝
const RESUME_IN = 0.35;   // 멈췄다 다시 들을 때
const PAUSE_OUT = 0.25;   // 멈출 때 · 닫을 때
const SWITCH_OUT = 0.08;  // 다른 곡으로 넘어갈 때 앞 곡을 끊지 않고 잠깐 줄임

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7.5 6.5 12 11V8a4.5 4.5 0 1 1-4.5 4.5H5A7 7 0 1 0 12 5z" fill="currentColor"/></svg>',
};

const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const clock = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createPlayer({ onState } = {}) {
  const audio = new Audio();
  audio.preload = 'none';

  let ctx = null;
  let gain = null;
  let graphTried = false;

  let ui = null;          // 지금 재생기가 들어 있는 칸의 부품들
  let track = null;       // { key, title, artist, src, gain, start, end, dur, youtube }
  let state = 'idle';     // idle · loading · playing · paused · ended · error
  let fadingOut = false;
  let needLift = 0;       // 소리가 실제로 나기 시작하면 이만큼(초)에 걸쳐 올립니다
  let raf = 0;
  let lastSec = -1;
  let pauseTimer = 0;
  let switchTimer = 0;
  let levelTok = 0;
  let volRaf = 0;
  // 곡을 바꾸는 중. 앞 곡이 끊기며 늦게 오는 '멈춤' 신호가 새 곡 상태를 덮어쓰지 않게 합니다.
  let switching = false;

  // ---------------------------------------------------------------- 방문 통계
  // 한 곡을 틀고(play) 그만두거나 넘기기(stop) 또는 끝까지 듣기(end)까지. 실제로 소리가 나던 시간만 셉니다.
  let heard = null;       // { title, ms, at }
  function heardTick(s) {
    if (!heard) return;
    if (heard.at) { heard.ms += Date.now() - heard.at; heard.at = 0; }
    if (s === 'playing') heard.at = Date.now();
  }
  function heardEnd(a) {
    if (!heard) return;
    heardTick('');
    stat('song', { song: heard.title, a, sec: Math.round(heard.ms / 1000) });
    heard = null;
  }
  function heardStart(t) {
    heardEnd('stop');
    heard = { title: t.title, ms: 0, at: 0 };
    stat('song', { song: t.title, a: 'play', sec: 0 });
  }
  window.addEventListener('pagehide', () => heardEnd('stop'));

  // ---------------------------------------------------------------- 소리 크기
  function graph() {
    if (graphTried) return;
    graphTried = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (IS_IOS && !('audioSession' in navigator)) return;   // 옛 아이폰: 무음 스위치에 막히지 않게 그냥 틉니다
    try {
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      const c = new AC();
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(c.destination);
      // 이 줄이 성공해야 비로소 소리가 Web Audio 로 넘어갑니다. 실패하면 <audio> 가 그대로 냅니다.
      c.createMediaElementSource(audio).connect(g);
      ctx = c;
      gain = g;
      audio.volume = 1;
    } catch (e) {
      ctx = null;
      gain = null;
    }
  }

  const vol = () => (track && track.gain > 0 ? Math.min(1, track.gain) : 1);
  // 곡마다 정한 페이드 길이 (관리 화면 하이라이트 편집기). 없으면 기본값.
  const fadeIn = () => (track && track.fadeIn != null ? track.fadeIn : FADE_IN);
  const fadeOut = () => (track && track.fadeOut != null ? track.fadeOut : FADE_OUT);

  // from 을 주면 그 값에서 출발합니다. '지금 값(p.value)' 은 방금 보낸 명령이 아직 처리 전이면
  // 옛 값으로 읽혀서, 0 에서 차오르게 하려던 페이드인이 1 에서 1 로 — 통째로 사라질 수 있습니다.
  function level(to, secs, from) {
    const target = Math.max(0, Math.min(1, to));
    const tok = ++levelTok;
    if (gain && ctx) {
      const t = ctx.currentTime;
      const p = gain.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(from != null ? from : p.value, t);
      if (secs > 0) p.linearRampToValueAtTime(target, t + secs);
      else p.setValueAtTime(target, t);
      return;
    }
    // Web Audio 가 없으면 <audio> 의 volume 을 직접 오르내립니다.
    cancelAnimationFrame(volRaf);
    const v0 = from != null ? from : audio.volume;
    const ms = secs * 1000;
    const t0 = performance.now();
    const step = (now) => {
      if (tok !== levelTok) return;
      const k = ms > 0 ? Math.min((now - t0) / ms, 1) : 1;
      try { audio.volume = v0 + (target - v0) * k; } catch (e) { return; }
      if (k < 1) volRaf = requestAnimationFrame(step);
    };
    volRaf = requestAnimationFrame(step);
    // rAF 는 배경 탭에서 멈춥니다. 끝 값에는 반드시 닿게 해 둡니다.
    setTimeout(() => { if (tok === levelTok) { try { audio.volume = target; } catch (e) { /* 무시 */ } } }, ms + 120);
  }

  // ---------------------------------------------------------------- 구간
  const startAt = () => (track && track.start > 0 ? track.start : 0);
  function endAt() {
    const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (track && track.dur) || 0;
    if (track && track.end > 0) return d ? Math.min(track.end, d) : track.end;
    return d;
  }

  // ---------------------------------------------------------------- 재생
  function begin(fadeSecs, fresh = false) {
    graph();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    clearTimeout(pauseTimer);
    if (!fresh && !audio.paused) {          // 멈추는 중이었다면 그 자리에서 다시 올립니다
      needLift = 0;
      setState('playing');
      level(vol(), fadeSecs);
      loop();
      return;
    }
    level(0, 0);
    needLift = fadeSecs;
    if (state !== 'playing') setState('loading');
    const p = audio.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === 'AbortError') return;   // 곡을 바꾸느라 끊긴 것
        switching = false;
        needLift = 0;
        setState('paused');
      });
    }
  }

  function load(t) {
    track = t;
    fadingOut = false;
    switching = true;
    clearTimeout(pauseTimer);
    const s = t.start > 0 ? t.start : 0;
    audio.src = encodeURI(t.src) + (s ? `#t=${s}` : '');
    audio.addEventListener('loadedmetadata', () => {
      if (s && Math.abs(audio.currentTime - s) > 0.25) { try { audio.currentTime = s; } catch (e) { /* 처음부터 */ } }
    }, { once: true });
    begin(fadeIn(), true);
  }

  function pause() {
    if (state !== 'playing' && state !== 'loading') return;
    needLift = 0;
    setState('paused');
    level(0, PAUSE_OUT);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (state === 'paused') { try { audio.pause(); } catch (e) { /* 무시 */ } } }, PAUSE_OUT * 1000 + 40);
  }

  function resume() {
    if (!track) return;
    if (!heard) heardStart(track);   // 끝까지 들은 뒤 다시 듣기
    if (state === 'error') { load(track); return; }
    fadingOut = false;
    if (state === 'ended') {
      try { audio.currentTime = startAt(); } catch (e) { /* 무시 */ }
      begin(fadeIn());
      return;
    }
    begin(RESUME_IN);
  }

  function toggle() {
    if (state === 'playing' || state === 'loading') pause(); else resume();
  }

  function finish() {
    cancelAnimationFrame(raf);
    needLift = 0;
    setState('ended');          // pause 신호보다 먼저 적어 둬야 'paused' 로 덮이지 않습니다
    heardEnd('end');
    try { audio.pause(); } catch (e) { /* 무시 */ }
    level(0, 0);
    paint(true);
  }

  function checkEnd() {
    if (!track || state !== 'playing' || switching) return;
    const e = endAt();
    if (!(e > 0)) return;
    const left = e - audio.currentTime;
    if (!fadingOut && left <= fadeOut()) {
      fadingOut = true;
      level(0, Math.max(0.05, left));
    }
    if (left <= 0.04) finish();
  }

  // 다른 곡으로: 앞 곡을 뚝 끊으면 '딱' 소리가 나서, 아주 짧게 줄인 뒤 넘어갑니다.
  function go(t) {
    clearTimeout(switchTimer);
    if ((state === 'playing' || state === 'loading') && !audio.paused) {
      switching = true;
      level(0, SWITCH_OUT);
      track = t;
      setState('loading');
      switchTimer = setTimeout(() => { switchTimer = 0; load(t); }, SWITCH_OUT * 1000 + 20);
    } else {
      load(t);
    }
  }

  function seekTo(k) {
    const s = startAt();
    const e = endAt();
    if (!(e > s)) return;
    const t = s + Math.min(0.995, Math.max(0, k)) * (e - s);
    try { audio.currentTime = t; } catch (err) { return; }
    if (fadingOut && e - t > fadeOut()) {
      fadingOut = false;
      if (state === 'playing') level(vol(), 0.2);
    }
    if (state === 'ended') setState('paused');
    paint();
  }

  // 그만 듣기 — 잦아들다 멈추고 파일을 놓습니다
  function stop() {
    clearTimeout(switchTimer);
    switchTimer = 0;
    if (!track) return;
    heardEnd('stop');
    needLift = 0;
    level(0, PAUSE_OUT);
    // 그 사이 다른 곡을 눌렀다면 멈추지 않습니다
    setTimeout(() => {
      if (track) return;
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { /* 무시 */ }
    }, PAUSE_OUT * 1000 + 40);
    cancelAnimationFrame(raf);
    track = null;
    switching = false;
    ui = null;
    setState('idle');
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; } catch (e) { /* 무시 */ } }
  }

  // ---------------------------------------------------------------- <audio> 신호
  audio.addEventListener('playing', () => {
    switching = false;
    if (state === 'paused' || state === 'ended' || state === 'idle') return;
    setState('playing');
    if (needLift) { const s = needLift; needLift = 0; level(vol(), s, 0); }   // 페이드인은 언제나 0 에서
    loop();
  });
  audio.addEventListener('waiting', () => { if (state === 'playing') setState('loading'); });
  // 우리가 멈춘 게 아닌데 멈췄을 때 (이어폰을 뺐거나, 다른 앱이 소리를 가져갔을 때)
  audio.addEventListener('pause', () => {
    if (switching) return;
    if (state === 'playing' || state === 'loading') { needLift = 0; setState('paused'); }
  });
  audio.addEventListener('timeupdate', checkEnd);   // 배경 탭에서도 불립니다 — 끝맺음은 여기서
  audio.addEventListener('ended', () => { if (state !== 'idle') finish(); });
  audio.addEventListener('error', () => {
    if (!track || !audio.getAttribute('src')) return;
    switching = false;
    needLift = 0;
    setState('error');
  });

  // ---------------------------------------------------------------- 재생기 (칸 안에 그림)
  function mount(host, t) {
    const span = (t.end > 0 ? t.end : t.dur || 0) - (t.start > 0 ? t.start : 0);
    host.innerHTML = `
      <div class="splay" data-state="loading">
        <button class="splay__btn" type="button" aria-label="일시정지">${ICON.pause}</button>
        <div class="splay__prog" role="slider" tabindex="0" aria-label="${esc(t.title)} 재생 위치"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <i class="splay__fill"></i><i class="splay__knob"></i>
        </div>
        <span class="splay__time"><b class="splay__cur">0:00</b> / <span class="splay__tot">${clock(span)}</span></span>
        <span class="splay__msg" role="status"></span>
        ${t.youtube ? `<a class="splay__yt" href="${esc(t.youtube)}" target="_blank" rel="noopener">원곡 ↗</a>` : ''}
      </div>`;
    const q = (s) => host.querySelector(s);
    const u = {
      root: q('.splay'), btn: q('.splay__btn'), prog: q('.splay__prog'), fill: q('.splay__fill'),
      knob: q('.splay__knob'), cur: q('.splay__cur'), tot: q('.splay__tot'), msg: q('.splay__msg'),
    };
    ui = u;
    lastSec = -1;

    u.btn.addEventListener('click', () => { if (ui === u) toggle(); });

    // 진행 막대: 누르거나 끌어서 옮기기
    const at = (e) => {
      const r = u.prog.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    u.prog.addEventListener('pointerdown', (e) => {
      if (ui !== u || !track) return;
      e.preventDefault();
      seekTo(at(e));
      const move = (m) => seekTo(at(m));
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    u.prog.addEventListener('keydown', (e) => {
      if (ui !== u) return;
      const s = startAt();
      const len = endAt() - s;
      if (!(len > 0)) return;
      const k = (audio.currentTime - s) / len;
      const d = 5 / len;
      if (e.key === 'ArrowRight') seekTo(k + d);
      else if (e.key === 'ArrowLeft') seekTo(k - d);
      else if (e.key === 'Home') seekTo(0);
      else if (e.key === 'End') seekTo(0.99);
      else return;
      e.preventDefault();
    });

    if ('mediaSession' in navigator && 'MediaMetadata' in window) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: t.artist,
          album: 'I.F 2026 LIVE · 하이라이트',
          artwork: [{ src: 'assets/logo-300.png', sizes: '402x300', type: 'image/png' }],
        });
        navigator.mediaSession.setActionHandler('play', resume);
        navigator.mediaSession.setActionHandler('pause', pause);
      } catch (e) { /* 지원 안 함 */ }
    }
  }

  function paint(done = false) {
    if (!ui || !track || (switching && !done)) return;
    const s = startAt();
    const e = endAt();
    const span = Math.max(0.1, e - s);
    const c = done ? e : Math.max(s, audio.currentTime || s);
    const k = Math.min(1, Math.max(0, (c - s) / span));
    ui.fill.style.transform = `scaleX(${k.toFixed(4)})`;
    ui.knob.style.left = `${(k * 100).toFixed(2)}%`;
    const sec = Math.floor(c - s);
    if (sec !== lastSec) {
      lastSec = sec;
      ui.cur.textContent = clock(c - s);
      ui.tot.textContent = clock(span);
      ui.prog.setAttribute('aria-valuenow', String(Math.round(k * 100)));
      ui.prog.setAttribute('aria-valuetext', `${clock(c - s)} / ${clock(span)}`);
    }
  }

  function loop() {
    cancelAnimationFrame(raf);
    const f = () => {
      paint();
      if (state === 'playing' || state === 'loading') raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
  }

  function setState(s) {
    heardTick(s);
    state = s;
    if (ui) {
      ui.root.dataset.state = s;
      const going = s === 'playing' || s === 'loading';
      ui.btn.innerHTML = s === 'ended' ? ICON.replay : (going ? ICON.pause : ICON.play);
      ui.btn.setAttribute('aria-label', s === 'ended' ? '다시 듣기' : (going ? '일시정지' : '재생'));
      ui.msg.textContent = s === 'error' ? '음원을 불러오지 못했어요' : '';
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = s === 'playing' || s === 'loading' ? 'playing' : (s === 'idle' ? 'none' : 'paused');
      } catch (e) { /* 무시 */ }
    }
    if (onState) onState(track ? track.key : null, s);
  }

  // ---------------------------------------------------------------- 바깥에 내놓는 것
  return {
    // host 칸에 재생기를 그리고 그 곡을 틉니다. 같은 곡이면 멈춤/재생.
    play(t, host) {
      if (track && track.key === t.key && ui && host.contains(ui.root)) { toggle(); return; }
      heardStart(t);
      mount(host, t);
      go(t);
    },
    toggle,
    stop,
    get state() { return state; },
    get key() { return track ? track.key : null; },
  };
}
