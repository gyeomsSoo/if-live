// 메인 페이지 후원사 구역: 후원사 페이지와 똑같은 전체 목록을 바로 보여줍니다.
import { $ } from './util.js';
import { renderTiers } from './sponsor-view.js';

export function initSponsors({ event, sponsors }) {
  const total = renderTiers($('#sponsorTiers'), { event, sponsors });
  const note = $('#sponsorNote');
  if (note) {
    note.textContent = `총 ${total}개의 매장이 함께해 주셨습니다. 가게를 누르면 위치를 확인하고 지도 어플로 열\u00a0수 있습니다.`;
    // 가게 이야기라서 가게 목록 바로 아래, 선배님들(HALL OF FAME) 위에 둡니다
    const fame = $('#sponsorTiers .tier--alumni');
    if (fame) fame.before(note);
  }
  const count = $('#sponsorCount');
  if (count) count.textContent = total;
}
