// 후원사 페이지
import { $, loadStats } from './util.js';
import { renderTiers } from './sponsor-view.js';
import { initInteract } from './interact.js';
import { headEnter } from './decode.js';

// ?heat=1 (관리 화면의 '누른 곳 지도'): 움직임 없이 처음부터 다 보이게
const HEAT = /[?&]heat/.test(location.search);
if (HEAT) document.documentElement.classList.add('shot', 'heat');

async function boot() {
  const box = $('#spTiers');
  try {
    const [event, sponsors] = await Promise.all([
      fetch('data/event.json', { cache: 'no-store' }).then((r) => r.json()),
      fetch('data/sponsors.json', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    const total = renderTiers(box, { event, sponsors });
    $('#spCount').textContent = total;
    if (sponsors.intro) $('#spIntro').textContent = sponsors.intro;
    document.title = `후원사 ${total}곳 · I.F 2026 LIVE PERFORMANCE`;
    initInteract();
    if (!HEAT) headEnter(document.querySelector('.sphead'));
  } catch (e) {
    box.innerHTML = '<p class="sploading">후원사 목록을 불러오지 못했어요. 잠시 뒤에 다시 들어와 주세요.</p>';
  }
}

boot();
loadStats();
