// 공연 안내: 무대 시간 칩, 지도 길찾기, 주소 복사, 캘린더 추가
import { $, $$, escapeHtml, copyText, toast } from './util.js';

const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

const UA = navigator.userAgent;
// iPadOS 13+ 는 Mac 으로 보이므로 터치 포인트로 구분
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/i.test(UA);

// ISO(+09:00) → ICS/구글 캘린더용 UTC 문자열 (20261105T100000Z)
// ICS 텍스트 이스케이프 (RFC 5545: 쉼표, 세미콜론, 백슬래시, 줄바꿈)
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fmtUtc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

function icsText(event) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//I.F//LIVE 2026//KO', 'BEGIN:VEVENT',
    `UID:if-live-${event.date}@ifband.kro.kr`,
    `DTSTAMP:${fmtUtc(new Date().toISOString())}`,
    `DTSTART:${fmtUtc(event.startAt)}`,
    `DTEND:${fmtUtc(event.endAt)}`,
    `SUMMARY:${icsEsc(`${event.band} ${event.edition} LIVE PERFORMANCE`)}`,
    `LOCATION:${icsEsc(`${event.venue.name} (${event.venue.address})`)}`,
    `DESCRIPTION:${event.site.description}\\n${event.site.url}`,
    `URL:${event.site.url}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

// 안드로이드(카카오톡·인스타 인앱 브라우저 포함)는 blob 다운로드가 자주 막혀서 구글 캘린더 링크로
function gcalUrl(event) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${event.band} ${event.edition} LIVE PERFORMANCE`,
    dates: `${fmtUtc(event.startAt)}/${fmtUtc(event.endAt)}`,
    details: `${event.site.description}\n${event.site.url}`,
    location: `${event.venue.name} (${event.venue.address})`,
    ctz: 'Asia/Seoul',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function initInfo({ event }) {
  // 무대 칩
  // 무대 이름을 <b> 로 분리해 두면 폰에서 세 줄로 가지런히 세울 수 있습니다.
  const stageHtml = event.stages
    .map((s) => `<span><b>${escapeHtml(s.label)}</b>${escapeHtml(s.start)} ~ ${escapeHtml(s.end)}</span>`)
    .join('');
  const stages = $('#ticketStages');
  if (stages) stages.innerHTML = stageHtml;
  // 히어로에도 같은 시간표를 세웁니다. '19:00 ~ 02:00 · 3 STAGES' 한 줄로는
  // 언제 쉬는지, 몇 시에 다시 시작하는지가 안 보였습니다.
  const heroStages = $('#heroStages');
  if (heroStages) heroStages.innerHTML = stageHtml;

  // 지도: 폰 · PC 모두 네이버지도 (후원사 가게들도 전부 네이버지도라 하나로 맞춤, 2026-10-10)
  const mapHref = event.venue.mapNaver || event.venue.mapKakao;
  const map = $('#btnMap');
  if (map) map.href = mapHref;

  // 주소 → 지도 링크 + 작은 복사 버튼
  // 끝의 번지는 앞 길 이름에 붙여 둡니다 (좁은 폰에서 '세명로' / '41' 로 떨어지지 않게)
  const keepNum = (a) => escapeHtml(a).replace(/ (\d[\d-]*)$/, '&nbsp;$1');
  $$('[data-ev="venue.address"]').forEach((el) => {
    const addr = event.venue.address;
    el.innerHTML = `<a class="addr__link" href="${escapeHtml(mapHref)}" target="_blank" rel="noopener" title="지도에서 열기">${keepNum(addr)}</a>`
      + `<button class="addr__copy" type="button" aria-label="주소 복사">${ICON_COPY}복사</button>`;
    $('.addr__copy', el).addEventListener('click', async () => {
      const ok = await copyText(addr);
      toast(ok ? '주소를 복사했어요' : '복사에 실패했어요');
    });
  });

  // 캘린더 추가
  const ics = $('#btnIcs');
  if (ics) {
    ics.addEventListener('click', () => {
      if (IS_ANDROID) {
        window.open(gcalUrl(event), '_blank', 'noopener');
        toast('구글 캘린더에서 저장을 눌러 주세요');
        return;
      }
      const blob = new Blob([icsText(event)], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      if (IS_IOS) {
        // iOS Safari 는 download 속성이 약함 → 새 창으로 열면 캘린더 미리보기("추가")가 뜬다
        const w = window.open(url, '_blank');
        if (!w) { // 인앱 브라우저 등에서 팝업이 막히면 구글 캘린더로
          URL.revokeObjectURL(url);
          location.href = gcalUrl(event);
          return;
        }
        toast('캘린더 미리보기에서 "추가"를 눌러 주세요');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = `IF-LIVE-${event.date}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('캘린더 파일을 내려받았어요');
    });
  }
}
