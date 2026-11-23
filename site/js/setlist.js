// 셋리스트: 무대 탭(LIVE 표시 · 키보드), 곡 줄 아래로 펼쳐지는 하이라이트 재생기, 공연 당일 NOW PLAYING
// (에이전트 B 담당)
import { $, $$, escapeHtml, stageTime, reducedMotion, onceInView } from './util.js';
import { createPlayer } from './player.js';

const PLAY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="8,5 19,12 8,19"/></svg>';
// 재생수 아이콘 (헤드폰 — 재생 단추와 헷갈리지 않게)
const VIEW_ICON = '<svg class="song__vicon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="2.5" y="13.5" width="5.5" height="8" rx="2" fill="currentColor"/><rect x="16" y="13.5" width="5.5" height="8" rx="2" fill="currentColor"/></svg>';
const HEART_ICON = '<svg class="song__heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6s-7.6-4.6-9.4-9.3C1.4 8.1 3.3 4.6 6.9 4.6c2.2 0 3.6 1.3 5.1 3.1 1.5-1.8 2.9-3.1 5.1-3.1 3.6 0 5.5 3.5 4.3 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/></svg>';
const SWAP_MS = 220;     // 탭 전환: 목록이 내려가며 사라지는 시간 (setlist.css .is-leaving 과 맞춤)
const COLLAPSE_MS = 340; // 재생기 접힘 높이 전환 시간 (setlist.css .song__player 과 맞춤)

// "지금" 시계. URL 에 ?now=2026-11-05T21:40:00+09:00 이 있으면 그 시각부터 흐르는 것으로 간주 (디버그용, 운영에 무해)
function makeClock() {
  let offset = 0;
  try {
    const raw = new URLSearchParams(location.search).get('now');
    if (raw) {
      const t = Date.parse(raw.replace(' ', '+')); // '+' 가 공백으로 풀려 들어온 경우 복원
      if (!Number.isNaN(t)) offset = t - Date.now();
    }
  } catch { /* 무시 */ }
  return () => Date.now() + offset;
}

export function initSetlist({ event, setlist, audio }) {
  const tabsEl = $('#setlistTabs');
  const listEl = $('#setlistList');
  const noteEl = $('#setlistNote');
  if (!tabsEl || !listEl) return;

  // 아직 손보는 중이면 목록을 덮어 둡니다. 디렉터 기기에서만 진짜가 보입니다.
  if (coverIfNeeded(setlist, tabsEl, listEl, noteEl, event)) return;

  // note 는 이 파일을 고치는 사람에게 주는 설명이라 화면에 그대로 쓰지 않습니다.
  const caption = setlist.caption || '셋리스트는 현장에서 조정될 수 있습니다.';
  if (noteEl) noteEl.textContent = `곡을 재생하면 하이라이트를 들으실\u00a0수 있습니다.\n부원들에게 많은 응원 부탁드립니다.\n※ ${caption}`;

  const now = makeClock();
  const stages = event.stages.map((s) => ({ ...s, songs: ((setlist.stages || []).find((x) => x.id === s.id) || {}).songs || [] }));
  const stageOf = (id) => stages.find((x) => x.id === id) || stages[0];

  // 지금 진행 중인 무대 (공연 당일, 무대 시간 안에서만 값이 나옴)
  function liveStage() {
    const t = now();
    for (const s of stages) {
      const st = stageTime(event.date, s.start).getTime();
      const en = stageTime(event.date, s.end, true).getTime();
      if (t >= st && t < en) return { stage: s, st, en, t };
    }
    return null;
  }

  // 지금 몇 번째 곡인지 (무대 시간을 곡 수로 균등 분할해 추정)
  function nowPlaying() {
    const live = liveStage();
    if (!live || !live.stage.songs.length) return null;
    const n = live.stage.songs.length;
    const idx = Math.min(n - 1, Math.floor(((live.t - live.st) / (live.en - live.st)) * n));
    return { stageId: live.stage.id, idx };
  }

  let current = (nowPlaying() || {}).stageId || stages[0].id;
  listEl.setAttribute('role', 'tabpanel');

  // ---------- 하이라이트 구간 ----------
  // "1:12" 도 "72" 도 받습니다. 없으면 null.
  const secs = (v) => {
    if (v == null || v === '') return null;
    const t = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    const m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
    return m ? Number(m[1]) * 60 + parseFloat(m[2]) : null;
  };

  // ---------- 음원 찾기 ----------
  // data/audio.json 의 목록에서 곡 제목으로 찾습니다. 띄어쓰기·대소문자·문장부호는 따지지 않습니다
  // (HI BULLY = Hi bully, 너와나 = 너와 나). 곡에 "audio" 를 적어 두면 그쪽이 먼저입니다.
  // 제목 뒤 괄호 속 버전 표기는 없는 셈 치고 한 번 더 찾습니다 (있잖아 (Rock Ver.) = 있잖아).
  const norm = (t) => String(t || '').normalize('NFC').toLowerCase().replace(/[\s!?.,·'"’()\-~]/g, '');
  const bare = (t) => String(t || '').replace(/\s*\([^)]*\)\s*/g, ' ');
  const library = new Map();
  Object.entries((audio && audio.clips) || {}).forEach(([title, c]) => {
    if (c && c.src) library.set(norm(title), c);
  });
  function clipOf(song) {
    const own = song.audio ? { src: String(song.audio) } : null;
    const c = own || library.get(norm(song.title)) || library.get(norm(bare(song.title))) || null;
    if (!c) return null;
    return {
      src: c.src,
      dur: Number(c.dur) || 0,
      gain: Number(c.gain) || 1,
      // 곡에 start/end 를 적으면 그게 먼저, 없으면 목록의 값
      start: secs(song.start) ?? (Number(c.start) || 0),
      end: secs(song.end) ?? (Number(c.end) || 0),
      // 페이드 길이(초). 관리 화면의 하이라이트 편집기에서 곡마다 정합니다. 없으면 재생기 기본값.
      fadeIn: c.fadeIn != null && c.fadeIn !== '' ? Number(c.fadeIn) : null,
      fadeOut: c.fadeOut != null && c.fadeOut !== '' ? Number(c.fadeOut) : null,
    };
  }

  function trackOf(stage, i) {
    const song = stage.songs[i];
    const c = song && clipOf(song);
    if (!c) return null;
    return {
      key: `${stage.id}:${i}`,
      stage: stage.label || stage.id,
      num: i + 1,
      title: song.title,
      artist: song.artist,
      youtube: song.youtube || '',
      ...c,
    };
  }

  const player = createPlayer();
  const closeTimers = new WeakMap();

  // ---------- 마크업 ----------
  function actionHtml(playable, isNow, open = false) {
    if (isNow) {
      return '<span class="eq" aria-hidden="true"><span></span><span></span><span></span></span>'
        + '<span class="song__np glow-pink"><span class="song__np-l">NOW PLAYING</span><span class="song__np-s">NOW</span></span>';
    }
    if (playable) return `${PLAY_ICON}<span class="song__lbl">${open ? 'CLOSE' : 'LISTEN'}</span>`;
    return '<span class="song__soon song__soon--l">COMING SOON</span><span class="song__soon song__soon--s">SOON</span>';
  }

  function songHtml(song, i, isNow) {
    // 들을 수 있는 곡: 음원이 있을 때만. 유튜브는 재생기의 '원곡 ↗' 로만 씁니다.
    const c = clipOf(song);
    const src = c ? c.src : '';
    const cls = ['song', isNow ? 'is-now' : '', src ? '' : 'is-soon'].filter(Boolean).join(' ');
    const interactive = src
      ? ` role="button" tabindex="0" aria-expanded="false" aria-label="${escapeHtml(song.artist)} ${escapeHtml(song.title)} 하이라이트 듣기"`
      : '';
    return `
      <div class="${cls}" data-i="${i}" data-src="${escapeHtml(src)}"${interactive}>
        <span class="song__num anton">${String(i + 1).padStart(2, '0')}</span>
        <div class="song__meta">
          <span class="song__artist">${escapeHtml(song.artist)}</span>
          <span class="song__title">${titleHtml(song.title)}</span>
        </div>
        <span class="song__stats">
          <span class="song__views" role="img" data-title="${escapeHtml(song.title)}" hidden>${VIEW_ICON}<b class="anton"></b></span>
          <button class="song__like" type="button" data-title="${escapeHtml(song.title)}" data-track="like:${escapeHtml(song.title)}" aria-pressed="false" hidden>${HEART_ICON}<span class="song__likes anton"></span></button>
        </span>
        <span class="song__action">${actionHtml(!!src, isNow)}</span>
        <div class="song__player"><div class="song__player-in"></div></div>
      </div>`;
  }

  // ---------- 기대돼요 (곡마다 하트) ----------
  // 서버(/api/likes)가 답할 때만 하트가 보입니다. 서버가 아직 이 기능을 모르면(다시 켜기 전) 아무것도 안 보입니다.
  // 같은 곡이 여러 부에 있어도 한 곡으로 셉니다(서버가 제목으로 묶음). 한 사람이 한 곡에 한 번.
  const likes = { ready: false, counts: {}, views: {}, mine: new Set(), busy: new Set(), id: likeId(), at: 0 };

  function paintLikes() {
    if (!likes.ready) return;
    $$('.song__like', listEl).forEach((b) => {
      const t = b.dataset.title;
      const n = likes.counts[t] || 0;
      const on = likes.mine.has(t);
      b.hidden = false;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `기대돼요${n ? ` ${n}명` : ''}`);
      $('.song__likes', b).textContent = n ? String(n) : '';   // 0 은 숫자 없이 하트만
    });
    // 재생수: 하이라이트를 튼 횟수 (서버가 한 사람 · 한 곡 · 하루 5번까지만 셉니다). 0 이면 숨깁니다.
    $$('.song__views', listEl).forEach((v) => {
      const n = likes.views[v.dataset.title] || 0;
      v.hidden = !n;
      $('b', v).textContent = n ? String(n) : '';
      v.setAttribute('aria-label', `재생 ${n}회`);
    });
  }

  function loadLikes() {
    likes.at = Date.now();
    fetch(`/api/likes?u=${encodeURIComponent(likes.id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.ok) return;
        likes.counts = d.counts || {};
        likes.views = d.views || {};
        likes.mine = new Set(d.mine || []);
        if (!likes.ready && noteEl) noteEl.textContent = `곡을 재생하면 하이라이트를 들으실\u00a0수 있습니다. ♡를 클릭하면 '기대돼요'를 남길\u00a0수 있습니다.\n부원들에게 많은 응원 부탁드립니다.\n※ ${caption}`;
        likes.ready = true;
        paintLikes();
      })
      .catch(() => { /* 하트 없이 그대로 */ });
  }

  // 누르면 바로 바뀌어 보이고(기다리지 않게), 서버 답으로 숫자를 맞춥니다. 실패하면 되돌립니다.
  function toggleLike(b) {
    const t = b.dataset.title;
    if (!likes.ready || likes.busy.has(t)) return;
    const on = !likes.mine.has(t);
    const before = likes.counts[t] || 0;
    likes.busy.add(t);
    if (on) likes.mine.add(t); else likes.mine.delete(t);
    likes.counts[t] = Math.max(0, before + (on ? 1 : -1));
    paintLikes();
    if (on) burst(b);
    fetch('/api/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ u: likes.id, song: t, on }) })
      .then((r) => r.json().then((d) => { if (!r.ok || !d.ok) throw d; likes.counts[t] = d.n; }))
      .catch(() => {
        if (on) likes.mine.delete(t); else likes.mine.add(t);
        likes.counts[t] = before;
      })
      .finally(() => { likes.busy.delete(t); paintLikes(); });
  }

  // 하트가 톡 커졌다가 작은 점들이 튀어 나갑니다
  function burst(b) {
    if (reducedMotion()) return;
    b.classList.remove('is-pop');
    void b.offsetWidth;
    b.classList.add('is-pop');
    for (let k = 0; k < 6; k += 1) {
      const s = document.createElement('i');
      const a = (k / 6) * Math.PI * 2 + Math.random() * 0.5;
      s.className = 'song__spark';
      s.style.setProperty('--dx', `${(Math.cos(a) * 22).toFixed(1)}px`);
      s.style.setProperty('--dy', `${(Math.sin(a) * 22).toFixed(1)}px`);
      b.appendChild(s);
      setTimeout(() => s.remove(), 650);
    }
  }

  function renderTabs() {
    const live = liveStage();
    tabsEl.innerHTML = stages.map((s) => {
      const isLive = !!live && live.stage.id === s.id;
      return `
      <button class="tab${isLive ? ' is-live' : ''}" role="tab" type="button" id="tab-${escapeHtml(s.id)}" data-stage="${escapeHtml(s.id)}" aria-controls="setlistList" aria-selected="false" tabindex="-1">
        ${escapeHtml(s.label)}<span class="tab__time"> · ${escapeHtml(s.start)} ~ ${escapeHtml(s.end)}</span><small>${escapeHtml(s.start)} ~ ${escapeHtml(s.end)}</small>
        <span class="tab__live"${isLive ? '' : ' hidden'}><span class="tab__dot" aria-hidden="true"></span>LIVE</span>
      </button>`;
    }).join('');
  }

  // 선택 상태만 갱신 (다시 그리지 않아 포커스가 유지됨)
  function syncTabs() {
    $$('.tab', tabsEl).forEach((b) => {
      const sel = b.dataset.stage === current;
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
    });
    listEl.setAttribute('aria-labelledby', `tab-${current}`);
  }

  function renderList() {
    const s = stageOf(current);
    const np = nowPlaying();
    listEl.innerHTML = s.songs.map((song, i) => songHtml(song, i, !!np && np.stageId === s.id && np.idx === i)).join('');
    paintLikes();
    watchGlitch();
  }

  /* ---------- 폰에서도 치지직 ----------
     마우스가 없는 기기에는 '올려놓기' 가 없어서 이 연출을 볼 길이 없었습니다.
     줄이 화면에 들어올 때 한 번, 그리고 0~5초 사이 아무 때나 한 번 더.
     줄마다 시각이 달라 목록이 불규칙하게 깜빡입니다.
     예전엔 제목 글자만 지직거려서 폰에선 거의 안 보였습니다. 이제 PC 에서 올려놓았을 때처럼
     줄 전체(왼쪽 하늘색 바 + 깎인 깔개 + 제목 지직)가 잠깐 켜집니다 (.song.is-zap, setlist.css).
     스크롤을 멈추고 읽는 동안에도 2~4초마다 화면에 보이는 줄 하나가 지직거립니다. */
  // 마우스가 없는 기기에서만 켭니다. 데스크탑은 올려놓으면 이미 지직거립니다.
  // ?glitch=force 를 붙이면 데스크탑에서도 켜집니다 (확인용).
  // 갤럭시 등 일부 폰은 펜 기능 때문에 '올려놓기 됨(hover)' 이라고 답합니다. 그래서 그 답만 믿지 않고,
  // 손가락이 실제로 화면에 닿는 순간(스크롤 포함) 폰으로 보고 켭니다.
  let NO_HOVER = window.matchMedia('(hover: none)').matches
    || window.matchMedia('(pointer: coarse)').matches
    || /[?&]glitch=force/.test(location.search);
  if (!NO_HOVER) {
    const onTouch = (e) => {
      if (e.pointerType && e.pointerType !== 'touch') return;
      window.removeEventListener('pointerdown', onTouch, true);
      window.removeEventListener('touchstart', onTouch, true);
      NO_HOVER = true;
      watchGlitch();
    };
    window.addEventListener('pointerdown', onTouch, { capture: true, passive: true });
    window.addEventListener('touchstart', onTouch, { capture: true, passive: true });
  }
  let stopGlitch = null;
  const glitchTimers = [];

  function zap(row) {
    if (!row || !document.contains(row) || row.classList.contains('is-open')) return;
    // 그 사이 화면 밖으로 나간 줄은 건너뜁니다. 목록을 빠르게 훑고 지나가면 열다섯 줄이 한꺼번에 예약되어
    // 아무도 못 보는 곳에서 몇 초 동안 지직거리며 다시 그리기만 했습니다.
    const box = row.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return;
    const title = $('.song__title', row);
    if (!title) return;
    title.classList.remove('is-glitch');
    void title.offsetWidth;          // 같은 애니메이션을 다시 걸려면 한 번 끊어 줘야 합니다
    title.classList.add('is-glitch');
    row.classList.add('is-zap');
    const off = () => title.classList.remove('is-glitch');
    title.addEventListener('animationend', off, { once: true });
    glitchTimers.push(setTimeout(off, 850));   // 애니메이션 신호가 안 와도 반드시 떼어 냅니다
    glitchTimers.push(setTimeout(() => row.classList.remove('is-zap'), 560));   // 줄은 조금 더 머물다 꺼짐
  }

  // 목록이 화면에 있는 동안: 2.2~4.2초마다 지금 보이는 줄 하나를 골라 지직
  let ambientIO = null;
  let ambientT = 0;
  function ambient(on) {
    clearTimeout(ambientT);
    if (!on) return;
    ambientT = setTimeout(() => {
      if (!document.hidden) {
        const h = window.innerHeight;
        const seen = $$('.song:not(.is-open):not(.is-now)', listEl).filter((r) => {
          const b = r.getBoundingClientRect();
          return b.top > 60 && b.bottom < h - 20;
        });
        if (seen.length) zap(seen[Math.floor(Math.random() * seen.length)]);
      }
      ambient(true);
    }, 2200 + Math.random() * 2000);
  }

  function watchGlitch() {
    glitchTimers.splice(0).forEach(clearTimeout);
    if (stopGlitch) { stopGlitch(); stopGlitch = null; }
    if (!NO_HOVER || reducedMotion()) return;
    stopGlitch = onceInView($$('.song', listEl), (row) => {
      // 줄이 다 나타난 뒤에 지직거려야 눈에 걸립니다 (등장 0.55초 + 차례 기다림)
      glitchTimers.push(setTimeout(() => zap(row), 760));
      // 그리고 1.6~5.6초 사이 아무 때나 한 번 더. 첫 번째와 겹치지 않게 띄웁니다.
      glitchTimers.push(setTimeout(() => zap(row), 1600 + Math.random() * 4000));
    });
    if (!ambientIO && 'IntersectionObserver' in window) {
      ambientIO = new IntersectionObserver((es) => ambient(es.some((e) => e.isIntersecting)), { threshold: 0.2 });
      ambientIO.observe(listEl);
    }
  }

  // 탭 전환: 현재 목록이 살짝 내려가며 사라진 뒤, 새 목록이 아래에서 올라옴
  let swapTimer = 0;
  function swapList() {
    clearTimeout(swapTimer);
    if (reducedMotion()) { renderList(); return; }
    listEl.classList.add('is-leaving');
    swapTimer = setTimeout(() => {
      renderList();
      listEl.classList.remove('is-leaving');
      listEl.classList.add('is-entering');
      requestAnimationFrame(() => requestAnimationFrame(() => listEl.classList.remove('is-entering')));
    }, SWAP_MS);
  }

  function selectStage(id, focus = false) {
    if (!stageOf(id) || id === current) {
      if (focus) { const b = $(`#tab-${id}`, tabsEl); if (b) b.focus(); }
      return;
    }
    current = id;
    player.stop();
    syncTabs();
    if (focus) { const b = $(`#tab-${id}`, tabsEl); if (b) b.focus(); }
    swapList();
  }

  // ---------- 곡 줄 펼치기 / 접기 ----------
  // 줄을 누르면 그 아래로 재생기가 펼쳐지며 하이라이트가 나옵니다(예전 유튜브 자리).
  // 다시 누르면 접히며 소리가 잦아들다 멎습니다. 한 번에 한 곡만.
  const keyOf = (row) => `${current}:${row.dataset.i}`;
  const setLabel = (row, open) => {
    if (row.classList.contains('is-now')) return;           // 공연 당일 NOW PLAYING 은 그대로
    const lbl = $('.song__lbl', row);
    if (lbl) lbl.textContent = open ? 'CLOSE' : 'LISTEN';
  };

  function closeRow(row) {
    row.classList.remove('is-open');
    row.setAttribute('aria-expanded', 'false');
    setLabel(row, false);
    if (player.key === keyOf(row)) player.stop();
    const box = $('.song__player-in', row);
    if (!box) return;
    clearTimeout(closeTimers.get(row));
    if (reducedMotion()) { box.innerHTML = ''; return; }
    // 접히는 동안은 재생기를 남겨 두어 높이가 부드럽게 줄어듭니다
    closeTimers.set(row, setTimeout(() => { if (!row.classList.contains('is-open')) box.innerHTML = ''; }, COLLAPSE_MS));
  }

  function openRow(row) {
    const t = trackOf(stageOf(current), Number(row.dataset.i));
    if (!t) return;
    $$('.song.is-open', listEl).forEach((o) => { if (o !== row) closeRow(o); });
    clearTimeout(closeTimers.get(row));
    row.classList.add('is-open');
    row.setAttribute('aria-expanded', 'true');
    setLabel(row, true);
    // 누른 그 순간에 재생을 시작해야 폰이 소리를 허락합니다
    player.play(t, $('.song__player-in', row));
  }

  function toggleRow(row) {
    if (!row || !row.dataset.src) return;
    if (row.classList.contains('is-open')) closeRow(row); else openRow(row);
  }

  // ---------- 공연 당일: NOW PLAYING / LIVE 탭 갱신 (열린 플레이어는 건드리지 않음) ----------
  function updateNow() {
    const live = liveStage();
    $$('.tab', tabsEl).forEach((b) => {
      const on = !!live && live.stage.id === b.dataset.stage;
      b.classList.toggle('is-live', on);
      const tag = $('.tab__live', b);
      if (tag) tag.hidden = !on;
    });
    const np = nowPlaying();
    const wantIdx = np && np.stageId === current ? np.idx : -1;
    $$('.song', listEl).forEach((row) => {
      const isNow = Number(row.dataset.i) === wantIdx;
      if (row.classList.contains('is-now') === isNow) return;
      row.classList.toggle('is-now', isNow);
      const act = $('.song__action', row);
      if (act) act.innerHTML = actionHtml(!!row.dataset.src, isNow, row.classList.contains('is-open'));
    });
  }

  // ---------- 이벤트 (위임: 다시 그려도 유지) ----------
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) selectStage(b.dataset.stage);
  });
  tabsEl.addEventListener('keydown', (e) => {
    const ids = stages.map((s) => s.id);
    let i = ids.indexOf(current);
    if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ids.length - 1;
    else return;
    e.preventDefault();
    selectStage(ids[i], true);
  });
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('.song__player')) return;   // 재생기 안을 누른 건 줄을 접지 않습니다
    const lk = e.target.closest('.song__like');
    if (lk) { toggleLike(lk); return; }               // 하트는 줄을 펼치지 않습니다
    toggleRow(e.target.closest('.song'));
  });
  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.song');
    if (!row || e.target !== row) return;
    e.preventDefault();
    toggleRow(row);
  });

  const cnt = $('#setlistCount');
  if (cnt) cnt.textContent = Math.max(0, ...stages.map((s) => s.songs.length));
  renderTabs();
  syncTabs();
  renderList();
  loadLikes();
  // 공연 당일엔 1분마다 NOW PLAYING 갱신. 탭을 다시 볼 때도 한 번 (기대돼요 숫자도 1분 넘었으면 새로)
  setInterval(updateNow, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    updateNow();
    if (likes.ready && Date.now() - likes.at > 60 * 1000) loadLikes();
  });
}

// 기대돼요용 익명 번호 (방문 통계 번호와 따로 — 통계에서 빠진 기기도 하트는 누를 수 있게)
// '과제곡 (적재 야간작업실 ver.)' 처럼 제목 끝의 괄호(버전 표기)는 다음 줄에 작게 (.song__ver).
// 가운데 빈칸을 남겨 두어 글자만 꺼내 쓰는 곳(방문 통계의 곡 이름 등)에는 원래 제목 그대로 읽힙니다.
function titleHtml(t) {
  const m = /^(.*\S)\s*(\([^()]*\))$/.exec(String(t || '').trim());
  if (!m) return escapeHtml(t);
  return `${escapeHtml(m[1])} <span class="song__ver">${escapeHtml(m[2])}</span>`;
}

function likeId() {
  const make = () => {
    const a = new Uint8Array(12);
    try { crypto.getRandomValues(a); } catch { for (let i = 0; i < a.length; i += 1) a[i] = Math.random() * 256; }
    return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  try {
    let v = localStorage.getItem('if_lid');
    if (!v || !/^[A-Za-z0-9_-]{8,40}$/.test(v)) { v = make(); localStorage.setItem('if_lid', v); }
    return v;
  } catch {
    return make();   // 저장을 못 하는 브라우저면 이번 방문만
  }
}

/* ==========================================================
   셋리스트 덮개
   data/setlist.json 의 cover.on 이 true 면 목록 대신 이 화면이 나옵니다.
   주소에 ?setlist=show 를 붙여 한 번 들어오면 그 기기에 표시가 남아,
   다음부터는 주소 없이도 진짜 목록이 보입니다. ?setlist=hide 로 되돌립니다.
   ========================================================== */
const PEEK_KEY = 'if_setlist_peek';

function peeking() {
  const m = /[?&]setlist=(show|hide)/.exec(location.search);
  try {
    if (m) {
      if (m[1] === 'show') localStorage.setItem(PEEK_KEY, '1');
      else localStorage.removeItem(PEEK_KEY);
      // 주소에 남겨 두면 이 링크를 받은 사람도 보게 됩니다. 지웁니다.
      const url = location.href.replace(/([?&])setlist=(show|hide)&?/, '$1').replace(/[?&]$/, '');
      history.replaceState(null, '', url);
    }
    return localStorage.getItem(PEEK_KEY) === '1';
  } catch {
    return !!m && m[1] === 'show';   // 저장을 못 하는 브라우저면 이번만
  }
}

function coverIfNeeded(setlist, tabsEl, listEl, noteEl, event) {
  const c = setlist.cover;
  if (!c || !c.on) return false;
  if (peeking()) { showPeekBadge(); return false; }

  tabsEl.hidden = true;
  const stageNames = (event.stages || []).map((x) => escapeHtml(x.label)).join(' · ');
  listEl.innerHTML = `
    <div class="slcover">
      <span class="tape tape--mint anton slcover__tape">SETLIST</span>
      <p class="slcover__en t-display">${escapeHtml(c.label || 'COMING SOON')}</p>
      <p class="slcover__ko">${escapeHtml(c.ko || '')}</p>
      ${c.sub ? `<p class="slcover__sub">${escapeHtml(c.sub)}</p>` : ''}
      ${stageNames ? `<p class="slcover__stages anton">${stageNames}</p>` : ''}
    </div>`;
  if (noteEl) noteEl.hidden = true;
  return true;
}

function showPeekBadge() {
  if (document.getElementById('peekBadge')) return;
  const b = document.createElement('div');
  b.className = 'peek';
  b.id = 'peekBadge';
  b.innerHTML = '<span>셋리스트 미리보기 · 나만 보입니다</span>'
    + '<button type="button" id="peekOff">가리기</button>';
  document.body.appendChild(b);
  $('#peekOff', b).addEventListener('click', () => {
    try { localStorage.removeItem(PEEK_KEY); } catch { /* 무시 */ }
    location.reload();
  });
}
