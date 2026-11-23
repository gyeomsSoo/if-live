// 카운트다운 (F2: 회전 스티커 + 큰 숫자)
// 공연 시작 전: D-N + HH:MM:SS / 공연 중: LIVE + ON STAGE NOW / 종료 후: THX + SEE YOU NEXT YEAR
// 숫자가 바뀔 때 살짝 튀는 미세 모션 (transform 만, reduced-motion 이면 없음)
import { $, pad2, reducedMotion } from './util.js';

const BUMP = [
  { transform: 'translateY(0) scale(1)' },
  { transform: 'translateY(-5px) scale(1.08)', offset: 0.3 },
  { transform: 'translateY(0) scale(1)' },
];
const BUMP_OPT = { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' };

export function initCountdown({ event }) {
  const root = $('#countdown');
  if (!root) return;
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  // D-N 은 남은 시간이 아니라 한국 날짜로 셉니다 → 매일 자정(KST)에 바뀜.
  // 남은 시간 ÷ 24h 로 세면 공연 시작 시각(19:00)마다 바뀌어 버립니다.
  const KST = 9 * 3.6e6;
  const kstDay = (t) => Math.floor((t + KST) / 8.64e7);
  const showDay = kstDay(start);
  const el = {
    dday: root.querySelector('[data-cd="dday"]'),
    label: root.querySelector('[data-cd="label"]'),
    h: root.querySelector('[data-cd="h"]'),
    m: root.querySelector('[data-cd="m"]'),
    s: root.querySelector('[data-cd="s"]'),
    badgeSub: root.querySelector('.badge__l'),
    rim: root.querySelector('.badge__rim textPath'),
  };
  const canBump = !reducedMotion() && typeof Element !== 'undefined' && 'animate' in Element.prototype;
  let first = true; // 첫 렌더는 튀지 않게

  const set = (node, text, bump = false) => {
    if (!node || node.textContent === text) return;
    node.textContent = text;
    if (bump && canBump && !first) node.animate(BUMP, BUMP_OPT);
  };
  const setState = (live, done) => {
    root.classList.toggle('is-live', live);
    root.classList.toggle('is-done', done);
  };
  const venueLine = `${event.dateLabel || ''} ${(event.venue && event.venue.en) || ''}`.trim();

  // 배지 테두리 글자.
  // 너무 짧으면 원의 절반만 채워져서 "잘린 것"처럼 보입니다.
  // 둘레를 거의 채우는 길이로 맞춥니다.
  const rimText = (head) => `${head} ★ ${venueLine} ★ `;

  // 디버그: ?now=2026-11-05T21:40:00+09:00 이면 그 시각을 "지금"으로 (setlist.js 와 동일 규칙)
  const nowParam = new URLSearchParams(location.search).get('now');
  const debugOffset = nowParam && !Number.isNaN(Date.parse(nowParam.replace(' ', '+'))) ? Date.parse(nowParam.replace(' ', '+')) - Date.now() : 0;

  // 스크린리더용 요약은 1분에 한 번만 갱신 (매초 낭독 방지). 시각 요소는 aria 로 읽지 않음.
  let lastMinuteText = '';
  const announce = (text) => {
    if (text === lastMinuteText) return;
    lastMinuteText = text;
    root.setAttribute('aria-label', text);
  };

  function tick() {
    const now = Date.now() + debugOffset;
    if (now >= start && now < end) {
      setState(true, false);
      set(el.dday, 'LIVE', true);
      set(el.label, 'ON STAGE NOW');
      set(el.badgeSub, 'ON STAGE');
      set(el.rim, rimText("ON STAGE NOW"));
      announce('공연 진행 중입니다');
      const left = end - now;
      set(el.h, pad2(left / 3.6e6), true);
      set(el.m, pad2((left / 6e4) % 60), true);
      set(el.s, pad2((left / 1e3) % 60), true);
      first = false;
      return;
    }
    if (now >= end) {
      setState(true, true);
      set(el.dday, 'THX', true);
      set(el.label, 'SEE YOU NEXT YEAR');
      set(el.badgeSub, 'THANK YOU');
      set(el.rim, rimText("THANK YOU"));
      announce('공연이 끝났습니다. 내년에 만나요');
      set(el.h, '00'); set(el.m, '00'); set(el.s, '00');
      first = false;
      return;
    }
    setState(false, false);
    const left = start - now;
    const days = Math.floor(left / 8.64e7);
    const dday = showDay - kstDay(now);
    set(el.dday, dday > 0 ? `D-${dday}` : 'D-DAY', true);
    set(el.label, 'SHOW STARTS IN');
    set(el.rim, rimText('SHOW STARTS IN'));
    set(el.h, pad2((left / 3.6e6) % 24), true);
    set(el.m, pad2((left / 6e4) % 60), true);
    set(el.s, pad2((left / 1e3) % 60), true);
    announce(`공연 시작까지 ${days}일 ${pad2((left / 3.6e6) % 24)}시간 ${pad2((left / 6e4) % 60)}분 남았습니다`);
    first = false;
  }

  // 카운트다운이 화면에 보이고 이 탭을 보고 있을 때만 매초 고칩니다.
  // 화면 밖이면 30초에 한 번(스크린리더용 요약이 분 단위라 그 정도면 맞습니다), 다시 보이면 곧바로 맞춥니다.
  // 한꺼번에 바뀐 숫자가 튀지 않게, 돌아온 첫 번은 튀는 모션 없이 고칩니다.
  let seen = true;
  let timer = 0;
  let every = 0;
  const pace = () => {
    const want = seen && !document.hidden ? 1000 : 30000;
    if (want === every) return;
    clearInterval(timer);
    every = want;
    if (want === 1000) { first = true; tick(); }
    timer = setInterval(tick, want);
  };
  tick();
  pace();
  document.addEventListener('visibilitychange', pace);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      seen = entries[entries.length - 1].isIntersecting;
      pace();
    }, { rootMargin: '100px 0px' }).observe(root);
  }
}
