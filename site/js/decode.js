// ============================================================
// decode.js — 구역 머리말 등장
//
// 스티커가 크게 비뚤어진 채로 있다가 제자리에 탁 찍히고,
// 그 사이 영문 제목의 글자가 통째로 바뀌다 점점 느려지며 멎습니다.
//
// 메인 페이지는 motion.js(GSAP)가 다른 등장들과 함께 지휘하고,
// 티켓·후원사 페이지는 GSAP 없이 여기 것만 씁니다.
// 그래서 두 곳이 같은 글자·같은 박자로 나타납니다.
// ============================================================
import { $$, reducedMotion } from './util.js';

// 왼쪽부터 하나씩 풀리면 글자가 아니라 숫자가 올라가는 것처럼 보입니다.
// 모든 글자가 같은 박자로 함께 바뀌되, 그 박자가 점점 느려지다 멎습니다.
// 제목 글꼴(Anton)에 있는 글자만 씁니다. ▓▒░ 같은 블록 문자는 이 글꼴에 없어서
// 다른 글꼴로 떨어지고, 그 글자가 줄 밖으로 삐져나와 아랫줄을 덮습니다.
const GLYPHS = '/\\<>*#?$%&+=_[]{}0189XZ';

export function scrambleIn(el) {
  const final = el.textContent;
  if (!/^[\x20-\x7E]{2,}$/.test(final.trim())) { el.classList.add('is-decoded'); return; }
  // 바뀌는 글자마다 폭이 달라 줄이 흔들립니다. 원래 폭을 붙들어 둡니다.
  el.style.minWidth = `${el.offsetWidth}px`;
  const total = 900;
  const t0 = performance.now();
  let next = 0;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    el.textContent = final;
    el.style.minWidth = '';
    el.classList.add('is-decoded');
  };
  // requestAnimationFrame 은 배경 탭이나 일부 인앱 브라우저에서 멈춥니다.
  // 그대로 두면 제목이 깨진 글자인 채로 남습니다. 시간을 재는 쪽으로도 끝내 줍니다.
  setTimeout(settle, total + 200);
  const tick = (t) => {
    if (settled) return;
    const p = Math.min((t - t0) / total, 1);
    if (p >= 1) { settle(); return; }
    if (t >= next) {
      // 처음엔 아주 촘촘하다가 끝으로 갈수록 뚝뚝 느려집니다 (14ms → 300ms)
      next = t + 14 * Math.pow(22, p);
      let out = '';
      for (let i = 0; i < final.length; i += 1) {
        out += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* GSAP 없이 머리말을 등장시킵니다.
   스티커는 CSS 로 찍고, 영문 제목은 위 글자 바뀜으로. */
export function headEnter(scope) {
  const root = scope || document;
  const tapes = $$('.tape', root);
  const titles = $$('.t-display', root).filter(
    (el) => !el.children.length && /^[\x20-\x7E]{2,}$/.test(el.textContent.trim()),
  );
  if (reducedMotion()) return;

  tapes.forEach((t) => t.classList.add('stamp-in'));
  // 스티커가 찍히는 동안 글자가 바뀝니다. 둘이 같이 움직여야 '등장' 으로 읽힙니다.
  titles.forEach((el) => { el.style.visibility = 'hidden'; });
  requestAnimationFrame(() => {
    tapes.forEach((t) => t.classList.add('is-in'));
    titles.forEach((el) => { el.style.visibility = ''; scrambleIn(el); });
  });
}
