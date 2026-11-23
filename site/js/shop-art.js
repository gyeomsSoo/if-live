// 헤드라인 후원사 카드에 들어가는 그림.
// 사진을 쓰지 않고 가게의 특징만 골라 직접 그렸습니다. 전부 SVG라 아무리 키워도 깨지지 않습니다.
//   야마      밤의 이자카야 정면 — 조명 포스터 띠, 노렌, 검은 간판의 夜馬, 매달린 초롱
//   미미싸롱   빨간 차양과 간판, 팝콘 기계와 캡슐 뽑기
//   오디향     위에서 내려다본 자연밥상 — 나무상에 둘러 놓인 반찬 그릇들

// ---------------------------------------------------------------- 야마

// 노렌 한 칸. 칸마다 파란 그림이 다릅니다.
function norenPanel(x, w, glyph, drop) {
  return `<g class="art-noren__p">
    <rect x="${x}" y="70" width="${w}" height="${62 + drop}" fill="url(#ya-cloth)"/>
    <rect x="${x}" y="70" width="${w}" height="11" fill="#22376A"/>
    <g transform="translate(${x + w / 2} 106)" stroke="#22376A" stroke-width="2.6"
       fill="none" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  </g>`;
}

const G_BOWL = '<path d="M-13 -4h26l-3 12a4 4 0 0 1-4 3h-12a4 4 0 0 1-4-3z"/><path d="M-6 -9q3-5 0-9"/><path d="M0 -8q3-5 0-9"/><path d="M6 -9q3-5 0-9"/>';
const G_FISH = '<path d="M-14 0c5-8 16-8 22 0-6 8-17 8-22 0z"/><path d="M8 0l7-5v10z"/><circle cx="-8" cy="-2" r="1.4" fill="#22376A"/>';
const G_SUSHI = '<path d="M-12 2h24a4 4 0 0 1 0 8h-24a4 4 0 0 1 0-8z"/><path d="M-13 -4q13-6 26 0-13 6-26 0z"/>';
const G_BOTTLE = '<path d="M-4 -14h8v6l3 4v14a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-14l3-4z"/><path d="M9 2h9l-2 9h-6z"/>';
const G_SKEWER = '<path d="M0 14v-26"/><circle cx="0" cy="-8" r="4.4"/><circle cx="0" cy="0" r="4.4"/><circle cx="0" cy="8" r="4.4"/>';
const GLYPHS = [G_BOWL, G_FISH, G_SUSHI, G_BOTTLE, G_SKEWER];

function lantern(cx, cordTo, rx, ry, label) {
  return `<g class="art-lamp" style="--cx:${cx}px">
    <line x1="${cx}" y1="60" x2="${cx}" y2="${cordTo - ry - 6}" stroke="#4A4A52" stroke-width="2"/>
    <rect x="${cx - 11}" y="${cordTo - ry - 7}" width="22" height="6" rx="2" fill="#2B2118"/>
    <ellipse class="art-lamp__glow" cx="${cx}" cy="${cordTo}" rx="${rx * 3.1}" ry="${ry * 2.5}" fill="url(#ya-glow)"/>
    <ellipse cx="${cx}" cy="${cordTo}" rx="${rx}" ry="${ry}" fill="url(#ya-lamp)"/>
    <ellipse cx="${cx}" cy="${cordTo}" rx="${rx}" ry="${ry}" fill="url(#ya-ribs)"/>
    <rect x="${cx - 9}" y="${cordTo + ry - 2}" width="18" height="6" rx="2" fill="#2B2118"/>
    ${label ? `<text class="art-lamp__t" x="${cx}" y="${cordTo - 9}" text-anchor="middle">居</text>
       <text class="art-lamp__t" x="${cx}" y="${cordTo + 4}" text-anchor="middle">酒</text>
       <text class="art-lamp__t" x="${cx}" y="${cordTo + 17}" text-anchor="middle">屋</text>` : ''}
  </g>`;
}

export const ART_YAMA = `
<svg class="art art--yama" viewBox="0 0 560 340" role="img" aria-label="밤의 이자카야 야마 — 노렌과 초롱, 夜馬 간판">
  <defs>
    <linearGradient id="ya-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B1A22"/><stop offset="1" stop-color="#0C0B0F"/>
    </linearGradient>
    <linearGradient id="ya-cloth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F6F1E7"/><stop offset=".86" stop-color="#EDE6D8"/><stop offset="1" stop-color="#CFC6B4"/>
    </linearGradient>
    <linearGradient id="ya-lamp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFC96B"/>
      <stop offset=".5" stop-color="#EE9C2C"/><stop offset="1" stop-color="#CE7818"/>
    </linearGradient>
    <radialGradient id="ya-glow">
      <stop offset="0" stop-color="#F6A945" stop-opacity=".55"/>
      <stop offset="1" stop-color="#F6A945" stop-opacity="0"/>
    </radialGradient>
    <pattern id="ya-ribs" width="8" height="7" patternUnits="userSpaceOnUse">
      <rect width="8" height="1.2" fill="#8A4E12" opacity=".28"/>
    </pattern>
    <pattern id="ya-wave" width="34" height="17" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="#FFFFFF" stroke-opacity=".07" stroke-width="1.2">
        <path d="M0 17a17 17 0 0 1 34 0"/><path d="M5 17a12 12 0 0 1 24 0"/><path d="M10 17a7 7 0 0 1 14 0"/>
        <path d="M-17 8.5a17 17 0 0 1 34 0"/><path d="M17 8.5a17 17 0 0 1 34 0"/>
      </g>
    </pattern>
  </defs>

  <rect width="560" height="340" fill="url(#ya-sky)"/>
  <rect width="560" height="340" fill="url(#ya-wave)"/>

  <!-- 주방 위 조명 포스터 띠 -->
  <g class="art-posters">
    <rect x="0" y="0" width="560" height="46" fill="#232227"/>
    ${Array.from({ length: 14 }, (_, i) => {
      const c = ['#E2554F', '#F3C860', '#4E7FB8', '#E8A24C', '#5FAE9B', '#D9D2C4'][i % 6];
      return `<rect class="art-poster" style="--d:${i * 0.08}s" x="${5 + i * 39.6}" y="5" width="34" height="36" fill="${c}"/>`;
    }).join('')}
    <rect x="0" y="44" width="560" height="4" fill="#0A0A0C"/>
  </g>

  <!-- 노렌 -->
  <g class="art-noren">
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => norenPanel(4 + i * 69.5, 65, GLYPHS[i % 5], i % 2 ? 0 : 6)).join('')}
  </g>

  <!-- 검은 간판 -->
  <g class="art-sign">
    <rect x="166" y="188" width="228" height="98" rx="3" fill="#0A0A0B" stroke="#3A3A42" stroke-width="3"/>
    <text class="art-sign__t" x="272" y="256" text-anchor="middle">夜馬</text>
    <rect x="352" y="222" width="16" height="30" rx="2" fill="#B3241F"/>
    <rect x="355" y="226" width="10" height="22" rx="1" fill="#E4C9A0" opacity=".5"/>
  </g>

  <!-- 매달린 초롱 -->
  ${lantern(84, 206, 27, 38, true)}
  ${lantern(476, 176, 19, 27, false)}

  <!-- 바닥 카운터 -->
  <rect x="0" y="300" width="560" height="40" fill="#17161B"/>
  <rect x="0" y="300" width="560" height="4" fill="#2C2A33"/>
</svg>`;

// ---------------------------------------------------------------- 미미싸롱
// 밤에 밖에서 본 가게입니다. 붉은 간판, 자주색 차양, 불 켜진 창,
// 그리고 유리 안쪽에서 맥주잔 두 개가 맞부딪히는 네온사인.

// 천장에서 내려온 원뿔 조명 하나
function miLamp(x, drop) {
  return `<g class="art-bulb" style="--cx:${x}px">
    <path d="M${x} 193v${drop}" stroke="#2A1B14" stroke-width="2"/>
    <path d="M${x - 15} ${193 + drop + 13}h30l-7-13h-16z" fill="#3B2A1E"/>
    <path d="M${x - 15} ${193 + drop + 13}h30l-2.5 3h-25z" fill="#6B4A30"/>
    <ellipse cx="${x}" cy="${193 + drop + 17}" rx="5" ry="3" fill="#FFE6AE"/>
    <ellipse class="art-mi__pool" cx="${x}" cy="${193 + drop + 46}" rx="34" ry="30"
             fill="url(#mi-lamp)" style="--d:${(x % 7) * 0.3}s"/>
  </g>`;
}

// 앉아 있는 손님
function miGuests(pts) {
  return pts.map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})" fill="#2B1710" opacity=".72">
    <circle cx="0" cy="-12" r="8.5"/>
    <path d="M-15 11c0-10 6.5-16 15-16s15 6 15 16z"/>
  </g>`).join('');
}

// 맥주잔 두 개를 맞대는 네온. 선만으로 그리고 바깥에 빛을 입힙니다.
const MUG_L = 'M-34 6h30v34a7 7 0 0 1-7 7h-16a7 7 0 0 1-7-7z'
  + 'M-34 14h-9a8 8 0 0 0 0 16h9';
const MUG_R = 'M4 6h30v34a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7z'
  + 'M34 14h9a8 8 0 0 1 0 16h-9';
const FOAM_L = 'M-37 6q3-9 10-7q2-8 10-6q7-3 10 5q7 0 6 8z';
const FOAM_R = 'M37 6q-3-9-10-7q-2-8-10-6q-7-3-10 5q-7 0-6 8z';

function neonMugs(cx, cy, k) {
  // 기울여 세우는 <g transform> 과 움직이는 <g class> 를 나눠 둡니다.
  // 한 덩이에 몰면 CSS 애니메이션의 transform 이 기울기를 덮어써 잔이 똑바로 섭니다.
  const lines = `
    <g class="art-neon__ml"><g transform="rotate(-13)">
      <path d="${MUG_L}"/><path d="${FOAM_L}"/>
      <path d="M-28 16v22M-20 16v22M-12 16v22" stroke-width="2.4" opacity=".75"/>
    </g></g>
    <g class="art-neon__mr"><g transform="rotate(13)">
      <path d="${MUG_R}"/><path d="${FOAM_R}"/>
      <path d="M12 16v22M20 16v22M28 16v22" stroke-width="2.4" opacity=".75"/>
    </g></g>
    <g class="art-neon__spark">
      <path d="M-6 -14l-5-9M0 -17v-10M6 -14l5-9" stroke-width="3" stroke-linecap="round"/>
    </g>`;
  return `<g class="art-neon" transform="translate(${cx} ${cy}) scale(${k})"
             fill="none" stroke-linejoin="round" stroke-linecap="round">
    <g class="art-neon__halo" stroke="#FF8FC8" stroke-width="9">${lines}</g>
    <g class="art-neon__core" stroke="#FFF3FA" stroke-width="3.4">${lines}</g>
  </g>`;
}

export const ART_MIMI = `
<svg class="art art--mimi" viewBox="0 0 560 340" role="img" aria-label="미미싸롱 — 붉은 간판과 자주색 차양, 불 켜진 창 안의 맥주잔 네온사인">
  <defs>
    <linearGradient id="mi-sign" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C0282A"/><stop offset="1" stop-color="#8E1618"/>
    </linearGradient>
    <linearGradient id="mi-awn" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A9677F"/><stop offset="1" stop-color="#7E4258"/>
    </linearGradient>
    <linearGradient id="mi-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A2529"/><stop offset="1" stop-color="#191518"/>
    </linearGradient>
    <linearGradient id="mi-in" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6B3F22"/><stop offset="1" stop-color="#3A2113"/>
    </linearGradient>
    <radialGradient id="mi-lamp">
      <stop offset="0" stop-color="#FFD08A" stop-opacity=".62"/>
      <stop offset="1" stop-color="#FFD08A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mi-sheen">
      <stop offset="0" stop-color="#FF6B6B" stop-opacity=".4"/>
      <stop offset="1" stop-color="#FF6B6B" stop-opacity="0"/>
    </radialGradient>
    <pattern id="mi-tile" width="30" height="22" patternUnits="userSpaceOnUse">
      <rect width="30" height="22" fill="url(#mi-wall)"/>
      <path d="M0 21.2h30M29.2 0v22" stroke="#100D10" stroke-width="1.2" opacity=".8"/>
    </pattern>
  </defs>

  <rect width="560" height="340" fill="#120F13"/>
  <rect x="0" y="140" width="560" height="200" fill="url(#mi-tile)"/>

  <!-- 간판 -->
  <ellipse class="art-mi__glow" cx="280" cy="50" rx="300" ry="80" fill="url(#mi-sheen)"/>
  <g class="art-mimisign">
    <rect x="0" y="14" width="560" height="64" fill="url(#mi-sign)"/>
    <rect x="0" y="14" width="560" height="3" fill="#E0574F" opacity=".8"/>
    <rect x="0" y="75" width="560" height="3" fill="#5E0D10"/>
    <!-- 맥주잔 -->
    <g transform="translate(52 46)">
      <path d="M-16 -4h26v26a6 6 0 0 1-6 6h-14a6 6 0 0 1-6-6z" fill="#F0B33C"/>
      <path d="M10 3h7a7 7 0 0 1 0 14h-7" fill="none" stroke="#F0B33C" stroke-width="4.5"/>
      <path d="M-18 -4q3-8 9-6q2-7 9-5q6-3 9 4q6 0 5 7z" fill="#FFF6E6"/>
      <path d="M-11 4v18M-4 4v18M3 4v18" stroke="#D99A2B" stroke-width="2" opacity=".7"/>
    </g>
    <text class="art-mimisign__t" x="92" y="63">미미싸롱</text>
    <text class="art-mimisign__s" x="432" y="52">BEER &amp; SOJU</text>
  </g>

  <!-- 자주색 차양 -->
  <g class="art-awning">
    <path d="M2 78h556v30q0 44-56 48H58Q2 152 2 108z" fill="url(#mi-awn)"/>
    <g stroke="#5F2F43" stroke-width="2" opacity=".55">
      <path d="M80 79v72M158 79v75M236 79v77M314 79v77M392 79v75M470 79v72"/>
    </g>
    <path d="M2 78h556v7H2z" fill="#B97A90" opacity=".5"/>
  </g>

  <text class="art-mi__tel" x="540" y="176" text-anchor="end">646-7942</text>

  <!-- 불 켜진 창 -->
  <g class="art-mi__win">
    <rect x="34" y="186" width="492" height="134" fill="#160F0A"/>
    <clipPath id="mi-glass"><rect x="34" y="186" width="492" height="134"/></clipPath>
    <g clip-path="url(#mi-glass)">
      <rect x="34" y="186" width="492" height="134" fill="url(#mi-in)"/>
      ${miLamp(112, 22)}
      ${miLamp(214, 30)}
      ${miLamp(344, 22)}
      ${miLamp(452, 30)}
      ${neonMugs(258, 250, 0.9)}
      ${miGuests([[90, 306, 1], [148, 310, 1.05], [318, 306, 1], [378, 311, 1.06], [470, 307, 1]])}
      <!-- 유리에 붙은 작은 가게 스티커 -->
      <g class="art-mi__decal" transform="translate(486 292)">
        <rect x="-26" y="-24" width="52" height="46" rx="3" fill="none" stroke="#F3E4D2" stroke-width="2" opacity=".55"/>
        <g transform="translate(0 -8) scale(.42)">
          <path d="M-16 -4h26v26a6 6 0 0 1-6 6h-14a6 6 0 0 1-6-6z" fill="#F3E4D2" opacity=".7"/>
          <path d="M10 3h7a7 7 0 0 1 0 14h-7" fill="none" stroke="#F3E4D2" stroke-width="4.5" opacity=".7"/>
        </g>
        <text class="art-mi__decal-t" x="0" y="16" text-anchor="middle">미미싸롱</text>
      </g>
    </g>
    <g stroke="#0C0A0C" stroke-width="8" fill="none">
      <rect x="34" y="186" width="492" height="134"/>
      <path d="M198 186v134M362 186v134"/>
    </g>
    <rect x="34" y="186" width="492" height="134" fill="none" stroke="#3A3238" stroke-width="2"/>
  </g>

  <!-- 가게 앞 단 -->
  <rect x="0" y="320" width="560" height="20" fill="#241E22"/>
  <rect x="0" y="320" width="560" height="3" fill="#3A3238"/>
</svg>`;

// ---------------------------------------------------------------- 오디향
// 위에서 내려다본 자연밥상. 가운데 전 접시를 둘러싸고 반찬 그릇이 놓입니다.
// 그릇은 차례로 하나씩 놓이듯 나타납니다(.art-bowl).

// 흰 사기그릇 하나. 안에 담긴 것만 바꿔 끼웁니다.
function bowl(r, inner) {
  return `<circle cx="0" cy="4" r="${r}" fill="#7A4E22" opacity=".22"/>
    <circle cx="0" cy="0" r="${r}" fill="#FCFAF6"/>
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="#CFC7B8" stroke-width="2"/>
    <circle cx="0" cy="0" r="${r - 6}" fill="none" stroke="#E3DCCF" stroke-width="1.4"/>
    <path d="M${-r + 5} -6a${r - 5} ${r - 5} 0 0 1 ${r - 9} -${r - 9}"
          fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".85"/>
    ${inner}`;
}

// 반찬 아홉 가지. 너무 가늘면 성냥개비처럼 보여서 도톰하게 썹니다.
const SIDES = {
  // 무생채 — 도톰한 흰 무에 고춧가루
  mu: `<g transform="rotate(-12)">
    <rect x="-17" y="-9" width="15" height="6" rx="3" fill="#F6F3EA"/>
    <rect x="0" y="-11" width="16" height="6" rx="3" fill="#F1EDE2" transform="rotate(14)"/>
    <rect x="-14" y="1" width="16" height="6" rx="3" fill="#F6F3EA" transform="rotate(-8)"/>
    <rect x="2" y="2" width="14" height="6" rx="3" fill="#EFEADD" transform="rotate(20)"/>
    <g fill="#C0392B"><circle cx="-6" cy="-2" r="1.6"/><circle cx="7" cy="-6" r="1.4"/><circle cx="3" cy="6" r="1.5"/></g>
  </g>`,
  // 오이무침 — 초록 반달 썰기
  oi: `<g>
    <path d="M-16 -4a8 8 0 0 1 16 0z" fill="#8FBF63" transform="rotate(-18 -8 -4)"/>
    <path d="M-2 -9a8 8 0 0 1 16 0z" fill="#7FB055" transform="rotate(12 6 -9)"/>
    <path d="M-12 5a8 8 0 0 1 16 0z" fill="#9AC97A" transform="rotate(-6 -4 5)"/>
    <path d="M2 3a7 7 0 0 1 14 0z" fill="#86B85E" transform="rotate(22 9 3)"/>
  </g>`,
  // 김치 — 붉게 접힌 배춧잎
  kimchi: `<g fill="#C33B26">
    <path d="M-15 -6q8-7 15-2 7 5 14-1-2 10-12 12t-17-9z"/>
    <path d="M-10 6q9-4 15 1 6 5 12 0-4 8-14 8t-13-9z" fill="#A82E1D"/>
    <path d="M-4 -2q6-3 10 1" fill="none" stroke="#F0C9A0" stroke-width="2" opacity=".7"/>
  </g>`,
  // 콩자반 — 윤나는 검은콩
  kong: `<g fill="#4A3320">
    <circle cx="-8" cy="-5" r="4.6"/><circle cx="2" cy="-8" r="4.4"/><circle cx="10" cy="-2" r="4.6"/>
    <circle cx="-3" cy="2" r="4.5"/><circle cx="6" cy="7" r="4.4"/><circle cx="-11" cy="6" r="4.2"/>
    <g fill="#8C6A46" opacity=".8">
      <circle cx="-9.4" cy="-6.4" r="1.3"/><circle cx="0.6" cy="-9.4" r="1.2"/>
      <circle cx="8.6" cy="-3.4" r="1.3"/><circle cx="-4.4" cy="0.6" r="1.2"/>
    </g>
  </g>`,
  // 시금치나물 — 도톰한 줄기
  namul: `<g fill="none" stroke="#4E7F3A" stroke-width="4" stroke-linecap="round">
    <path d="M-14 -5q8 4 15-3"/><path d="M-10 3q9 3 16-4"/>
    <path d="M-4 9q8 1 13-6" stroke="#3E6B2E"/>
  </g>
  <g fill="#8FBF63"><circle cx="9" cy="-8" r="2.4"/><circle cx="-13" cy="6" r="2.2"/></g>`,
  // 멸치볶음 — 잔멸치
  myeolchi: `<g fill="#E6D6AE">
    <path d="M-15 -5l9 2-9 2z"/><path d="M-4 -9l9 2-9 2z"/><path d="M4 0l9 2-9 2z"/>
    <path d="M-9 4l9 2-9 2z"/><path d="M-1 9l8 2-8 2z"/>
    <g fill="#BCA57A"><circle cx="-13" cy="-3" r=".9"/><circle cx="-2" cy="-7" r=".9"/><circle cx="6" cy="2" r=".9"/></g>
  </g>`,
  // 어묵볶음 — 주황 어묵 채
  eomuk: `<g transform="rotate(-8)">
    <rect x="-16" y="-8" width="18" height="5" rx="2.5" fill="#E8A257"/>
    <rect x="-2" y="-2" width="17" height="5" rx="2.5" fill="#DE9345" transform="rotate(14)"/>
    <rect x="-14" y="3" width="18" height="5" rx="2.5" fill="#EDAD66" transform="rotate(-10)"/>
    <g fill="#3E6B2E"><rect x="4" y="-9" width="7" height="2.4" rx="1.2"/><rect x="-9" y="9" width="7" height="2.4" rx="1.2"/></g>
  </g>`,
  // 감자조림 — 네모나게 썬 감자
  gamja: `<g>
    <rect x="-14" y="-9" width="11" height="10" rx="2.5" fill="#EBC169"/>
    <rect x="-1" y="-11" width="11" height="10" rx="2.5" fill="#E3B455" transform="rotate(12)"/>
    <rect x="-9" y="2" width="11" height="10" rx="2.5" fill="#F0C878" transform="rotate(-8)"/>
    <rect x="4" y="3" width="10" height="9" rx="2.5" fill="#E3B455" transform="rotate(18)"/>
    <g fill="#5C3F1E" opacity=".35"><circle cx="-8" cy="-4" r="1.4"/><circle cx="6" cy="-3" r="1.3"/></g>
  </g>`,
  // 깻잎장아찌 — 포개 놓은 잎
  kkaennip: `<g fill="#3E6B2E">
    <path d="M-13 -2q7-10 16-5 9 5 1 12-8 7-17-7z"/>
    <path d="M-8 4q7-8 15-3 8 5 1 11-8 6-16-8z" fill="#2F5A24"/>
    <path d="M-6 1q7 2 12-3" fill="none" stroke="#8FBF63" stroke-width="1.6" opacity=".8"/>
  </g>`,
};

// 가운데 접시를 둘러싸고 아홉 그릇. 자리는 손으로 잡았습니다.
const BOWL_SPOTS = [
  [96, 86, 34, 'mu'],
  [200, 62, 30, 'oi'],
  [392, 66, 32, 'kimchi'],
  [480, 134, 33, 'kong'],
  [84, 192, 33, 'namul'],
  [166, 280, 31, 'myeolchi'],
  [288, 300, 32, 'eomuk'],
  [400, 288, 30, 'gamja'],
  [478, 228, 32, 'kkaennip'],
];

function bowls() {
  // 자리를 옮기는 바깥 <g> 와 움직이는 안쪽 <g> 를 나눕니다.
  // 한 덩이에 몰면 CSS 애니메이션의 transform 이 자리를 덮어써 가운데로 모입니다.
  return BOWL_SPOTS.map(([x, y, r, kind], i) =>
    `<g transform="translate(${x} ${y})"><g class="art-bowl" style="--d:${(i + 1) * 0.09}s">
      ${bowl(r, SIDES[kind])}
    </g></g>`).join('');
}

export const ART_ODI = `
<svg class="art art--odi" viewBox="0 0 560 340" role="img" aria-label="오디향 — 위에서 내려다본 자연밥상">
  <defs>
    <linearGradient id="od-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#D9AE77"/><stop offset=".55" stop-color="#C9975E"/><stop offset="1" stop-color="#B07F49"/>
    </linearGradient>
    <pattern id="od-grain" width="120" height="26" patternUnits="userSpaceOnUse">
      <path d="M0 6q30 -5 60 0t60 0" fill="none" stroke="#8C5F35" stroke-opacity=".16" stroke-width="1.6"/>
      <path d="M0 17q30 5 60 0t60 0" fill="none" stroke="#8C5F35" stroke-opacity=".12" stroke-width="1.4"/>
    </pattern>
    <radialGradient id="od-light" cx=".5" cy=".32">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".42"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="od-berry" x1=".3" y1=".2" x2=".8" y2="1">
      <stop offset="0" stop-color="#A473C9"/><stop offset="1" stop-color="#5E3480"/>
    </linearGradient>
  </defs>

  <rect width="560" height="340" fill="url(#od-wood)"/>
  <rect width="560" height="340" fill="url(#od-grain)"/>
  <rect width="560" height="340" fill="url(#od-light)"/>

  <!-- 가운데 네모 접시: 갓 부친 전 -->
  <g transform="translate(292 176)"><g class="art-bowl art-bowl--main" style="--d:0s">
    <rect x="-58" y="-42" width="118" height="88" rx="12" fill="#7A4E22" opacity=".26"/>
    <rect x="-60" y="-46" width="118" height="88" rx="12" fill="#FCFAF6"/>
    <rect x="-60" y="-46" width="118" height="88" rx="12" fill="none" stroke="#CFC7B8" stroke-width="2"/>
    <rect x="-52" y="-38" width="102" height="72" rx="8" fill="none" stroke="#7E8A94" stroke-width="1.2" opacity=".5"/>
    <path d="M-56 -14a46 46 0 0 1 34 -28" fill="none" stroke="#FFFFFF" stroke-width="3" opacity=".9"/>
    <g transform="translate(-22 -14) rotate(-10)">
      <ellipse rx="20" ry="15" fill="#E1A645"/><ellipse rx="13" ry="9.5" fill="#F4CB7C"/>
      <rect x="-10" y="-3" width="8" height="2.6" rx="1.3" fill="#3E6B2E"/>
      <rect x="0" y="3" width="7" height="2.6" rx="1.3" fill="#4E7F3A"/>
      <circle cx="3" cy="-4.5" r="3" fill="none" stroke="#C0392B" stroke-width="2"/>
    </g>
    <g transform="translate(18 -18) rotate(16)">
      <ellipse rx="18" ry="14" fill="#7FA45C"/><ellipse rx="11.5" ry="8.5" fill="#A8C68A"/>
      <rect x="-8" y="-2" width="7" height="2.4" rx="1.2" fill="#3E6B2E"/>
      <rect x="1" y="3" width="6" height="2.4" rx="1.2" fill="#2F5A24"/>
      <circle cx="2" cy="-5" r="2.6" fill="none" stroke="#C0392B" stroke-width="1.8"/>
    </g>
    <g transform="translate(0 16) rotate(6)">
      <ellipse rx="21" ry="15" fill="#D98C4C"/><ellipse rx="13.5" ry="9.5" fill="#F0B478"/>
      <rect x="-10" y="-3" width="8" height="2.6" rx="1.3" fill="#3E6B2E"/>
      <rect x="1" y="4" width="7" height="2.6" rx="1.3" fill="#4E7F3A"/>
      <circle cx="4" cy="-4" r="3" fill="none" stroke="#C0392B" stroke-width="2"/>
    </g>
  </g></g>

  <!-- 둘러놓은 반찬 그릇 -->
  ${bowls()}

  <!-- 수저 한 벌 -->
  <g class="art-spoon" transform="translate(492 232) rotate(-8)">
    <rect x="-4" y="-52" width="8" height="104" rx="4" fill="#F2EFE6"/>
    <rect x="-3" y="-50" width="2.4" height="100" rx="1.2" fill="#FFFFFF" opacity=".8"/>
    <ellipse cx="0" cy="-58" rx="10" ry="14" fill="#F2EFE6"/>
    <ellipse cx="0" cy="-58" rx="6" ry="9" fill="#DDD8CA"/>
  </g>
  <g class="art-spoon" transform="translate(514 236) rotate(-4)">
    <rect x="-3" y="-56" width="6" height="112" rx="3" fill="#8C5F35"/>
    <rect x="-2.2" y="-54" width="1.8" height="108" rx=".9" fill="#B4834F" opacity=".8"/>
  </g>
  <g class="art-spoon" transform="translate(526 240) rotate(1)">
    <rect x="-3" y="-56" width="6" height="112" rx="3" fill="#8C5F35"/>
    <rect x="-2.2" y="-54" width="1.8" height="108" rx=".9" fill="#B4834F" opacity=".8"/>
  </g>

  <!-- 흩어진 오디 -->
  ${[[54, 54, 1], [56, 292, -1], [402, 42, 1], [186, 312, -1], [548, 96, 1]].map(([x, y, f], i) => `
    <g transform="translate(${x} ${y}) scale(${f} 1)"><g class="art-berry" style="--d:${i * 0.5}s">
      <path d="M0 -13c7 0 11 5 11 11 0 8-5 15-11 15s-11-7-11-15c0-6 4-11 11-11z" fill="url(#od-berry)"/>
      <circle cx="-4" cy="-4" r="3.6" fill="#C69BE0" opacity=".75"/>
      <path d="M0 -13c-4-6-11-8-16-6 2 6 8 9 16 6z" fill="#5E8F45"/>
    </g></g>`).join('')}

</svg>`;


// ---------------------------------------------------------------- 풍덕천 두꺼비집 하소점
// 크림색 판벽에 얹힌 흰 간판, 남색 두꺼비 문장, 주황 띠와 검은 차양.
// 안쪽은 뉴트로 실내포차 — 꽃무늬 벽지에 소주병이 줄지어 있습니다.

// 간판 오른쪽의 두꺼비 — 로고 원판(assets/sponsors/FrogHouse/5.png)에서 윤곽을 그대로 따냈습니다.
// 손으로 근사하면 자꾸 다른 개구리가 나와서, 보라색 화소를 골라 경계를 따고
// 점을 줄여 경로로 옮겼습니다. 그래서 모양이 사진과 같습니다.
// 색만 간판(3.png) 쪽을 따릅니다 — 연한 파란 몸에 남색 획, 남색 별.
const TOAD_OUTLINE = 'M-1.5 -34.3L3.1 -34L5.3 -31.8L8.3 -23.8L17 -15.8L17 -14.5L13.3 -11.4L12.7 -7.7L13.9 -4.6L16.7 -3.1L20.4 -3.1L22.3 -4.9L23.2 -4.6L25 7.1L27.5 12.1L29.4 13.9L30.6 17.6L27.8 21L17.9 29.1L14.2 29.7L12.4 28.4L10.5 28.4L6.2 32.1L2.5 34L-1.9 34L-3.4 31.2L-2.2 28.1L2.2 23.8L2.2 21.9L0.3 20.7L-2.2 16.4L-2.5 8.7L-3.4 15.8L-1.5 21.3L-5.3 25L-7.4 29.1L-11.1 29.1L-14.2 27.8L-18.9 23.2L-20.1 20.1L-20.1 17L-21.6 15.5L-23.5 15.5L-24.4 17L-24.4 19.5L-21.9 27.5L-23.5 29.1L-26 29.7L-29.1 29.1L-30 26.9L-26.3 23.2L-26.3 20.1L-30 10.8L-29.4 7.1L-25.7 2.2L-26.9 -7.1L-28.7 -11.4L-28.7 -15.8L-26.6 -17.9L-22.9 -19.2L-18.5 -19.2L-14.8 -17.9L-12.4 -16.7L-6.8 -11.1L-2.5 -9.9L-0.9 -8.3L1.5 -5.3L2.2 1.5L-0.9 4.6L-2.2 6.5L-1.9 7.4L3.4 2.2L3.4 -3.4L-0.3 -9.6L4.6 -13.3L4.3 -16.1L2.5 -16.7L-0.6 -14.2L-3.7 -14.2L-8.7 -19.2L-15.5 -22.9L-26.3 -23.2L-23.5 -26.6L-18.2 -30.6L-16.7 -33.4L-11.7 -34L-8.7 -32.1L-6.2 -32.1L-1.5 -34.3Z';
const TOAD_INK = 'M-1.5 -34.3L3.1 -34L5.3 -31.8L8.3 -23.8L17 -15.8L17 -14.5L13.3 -11.4L12.7 -7.7L13.9 -4.6L16.7 -3.1L20.4 -3.1L22.3 -4.9L23.2 -4.6L25 7.1L27.5 12.1L29.4 13.9L30.6 17.6L27.8 21L17.9 29.1L14.2 29.7L12.4 28.4L10.5 28.4L6.2 32.1L2.5 34L-1.9 34L-3.4 31.2L-2.2 28.1L2.2 23.8L2.2 21.9L0.3 20.7L-2.2 16.4L-2.5 8.7L-3.4 15.8L-1.5 21.3L-5.3 25L-7.4 29.1L-11.1 29.1L-14.2 27.8L-18.9 23.2L-20.1 20.1L-20.1 17L-21.6 15.5L-23.5 15.5L-24.4 17L-24.4 19.5L-21.9 27.5L-23.5 29.1L-26 29.7L-29.1 29.1L-30 26.9L-26.3 23.2L-26.3 20.1L-30 10.8L-29.4 7.1L-25.7 2.2L-26.9 -7.1L-28.7 -11.4L-28.7 -15.8L-26.6 -17.9L-22.9 -19.2L-18.5 -19.2L-14.8 -17.9L-12.4 -16.7L-6.8 -11.1L-2.5 -9.9L-0.9 -8.3L1.5 -5.3L2.2 1.5L-0.9 4.6L-2.2 6.5L-1.9 7.4L3.4 2.2L3.4 -3.4L-0.3 -9.6L4.6 -13.3L4.3 -16.1L2.5 -16.7L-0.6 -14.2L-3.7 -14.2L-8.7 -19.2L-15.5 -22.9L-26.3 -23.2L-23.5 -26.6L-18.2 -30.6L-16.7 -33.4L-11.7 -34L-8.7 -32.1L-6.2 -32.1L-1.5 -34.3ZM0 -38.9L-4.9 -37.7L-6.2 -36.5L-8.7 -36.5L-13 -38.3L-17.9 -37.1L-22.9 -31.5L-29.4 -26.3L-31.8 -21.9L-33.1 -18.9L-33.1 -12.7L-30 0.3L-33.7 6.5L-33.7 13.3L-30.6 20.1L-34.3 26.3L-33.7 29.4L-34.3 30L-31.5 32.8L-28.4 34L-24.1 34L-18.5 30.9L-16.7 30.9L-13.6 32.8L-7.4 34L-3.1 38.3L1.2 38.9L7.4 36.5L11.7 33.4L16.7 34L21 32.1L30.9 24.1L34.3 20.1L34.3 15.1L28.7 5.3L28.1 -3.4L25.7 -10.8L21.3 -17.6L12.1 -25.7L10.2 -31.2L6.5 -36.8L4.3 -38.3L0 -38.9ZM0 -32.1L-2.8 -31.2L-4.6 -26.9L-2.5 -22.9L1.9 -22.3L4 -23.8L5.3 -27.5L2.5 -31.5L0 -32.1ZM-1.5 -30L1.2 -30.3L3.4 -28.1L3.4 -25.7L0.6 -27.8L-2.5 -27.2L-2.8 -28.7L-1.5 -30ZM18.5 0.6L17 2.2L17 5.9L21 6.8L22.6 5.3L22.6 2.8L21.6 1.2L18.5 0.6Z';
// 로고에서 잰 별의 자리와 크기 [x, y, 반지름]
const TOAD_STARS = [[-5.3,-58.1,2.5], [7.1,-55.9,2.5], [18.5,-51.6,2.8], [28.4,-45.4,2.8], [37.7,-37.4,2.8], [43.9,-28.1,2.8], [48.5,-17,2.8], [51.9,-5.6,3.1], [53.2,6.5,2.8], [51.9,18.9,2.8]];

function starPath(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 10; i += 1) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? r * 0.46 : r;
    p.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return `M${p.join('L')}Z`;
}

function toadMark(cx, cy, k) {
  const stars = TOAD_STARS.map(([x, y, r], i) =>
    `<path class="art-td__star" style="--d:${(i * 0.2).toFixed(2)}s" d="${starPath(x, y, r * 1.45)}" fill="#26327A"/>`).join('');
  // 별까지 포함한 덩어리의 한가운데를 원점으로 맞춥니다
  return `<g transform="translate(${cx} ${cy}) scale(${k}) translate(-10.4 10.9)">
    ${stars}
    <g class="art-td__toad">
      <path d="${TOAD_OUTLINE}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="9" stroke-linejoin="round"/>
      <path d="${TOAD_OUTLINE}" fill="#AFC7EC"/>
      <path d="${TOAD_INK}" fill="#26327A" fill-rule="evenodd"/>
    </g>
  </g>`;
}

// ---------------------------------------------------------------- 간판 글씨
// 두꺼비집 세로 간판의 일곱 글자를 직접 그립니다.
// 글꼴로는 이 크기(폰에서 한 자 10px)에서 획이 뭉개지고, 실제 간판의
// 획 끝이 곧게 깎인 모양과도 다릅니다. 획 굵기를 정할 수 있어야 작아도 읽힙니다.
// 글자마다 100×100 칸에 그려 두고 쓸 때 줄입니다.
const SIGN_GLYPH = {
  // ㄷ + ㅜ
  '두': 'M16 8H64V20H28V38H62V50H16Z'
      + 'M8 60H92V72H56V94H44V72H8Z',
  // ㄲ + ㅓ
  '꺼': 'M6 12H32V58H21V23H6Z'
      + 'M36 12H62V58H51V23H36Z'
      + 'M80 6H92V94H80Z'
      + 'M64 42H80V53H64Z',
  // ㅂ + ㅣ
  '비': 'M10 12H22V84H10Z'
      + 'M48 12H60V84H48Z'
      + 'M10 41H60V51H10Z'
      + 'M10 74H60V84H10Z'
      + 'M80 6H92V94H80Z',
  // ㅈ + ㅣ + ㅂ(받침)
  '집': 'M8 8H64V19H8Z'
      + 'M30 19H42L22 52H9Z'
      + 'M30 19H42L63 52H50Z'
      + 'M78 6H90V52H78Z'
      + 'M18 60H29V96H18Z'
      + 'M59 60H70V96H59Z'
      + 'M18 71H70V81H18Z'
      + 'M18 86H70V96H18Z',
  // ㅍ + ㅜ + ㅇ   (ㅇ 은 바깥을 시계방향, 안을 반시계방향으로 돌려 구멍을 냅니다)
  '풍': 'M8 4H92V15H8Z'
      + 'M20 15H32V36H20Z'
      + 'M68 15H80V36H68Z'
      + 'M8 36H92V47H8Z'
      + 'M12 53H88V63H12Z'
      + 'M44 63H56V72H44Z'
      + 'M50 100a16 16 0 1 1 0-32a16 16 0 1 1 0 32Z'
      + 'M50 91a7 7 0 1 0 0-14a7 7 0 1 0 0 14Z',
  // ㄷ + ㅓ + ㄱ(받침)
  '덕': 'M10 6H52V17H22V34H50V45H10Z'
      + 'M68 4H80V54H68Z'
      + 'M52 24H68V35H52Z'
      + 'M14 64H88V96H76V75H14Z',
  // ㅊ + ㅓ + ㄴ(받침)
  '천': 'M27 0H39L36 11H24Z'
      + 'M8 16H62V27H8Z'
      + 'M29 27H41L21 58H8Z'
      + 'M29 27H41L62 58H49Z'
      + 'M78 8H90V62H78Z'
      + 'M62 30H78V41H62Z'
      + 'M14 68H26V86H88V96H14Z',
};

// 글자를 세로(또는 가로)로 늘어놓습니다. cx 는 줄의 한가운데입니다.
function signWrite(str, cx, y, size, step, fill, down = true) {
  const k = size / 100;
  return [...str].map((ch, i) => {
    const d = SIGN_GLYPH[ch];
    if (!d) return '';
    const gx = down ? cx - size / 2 : cx - (str.length * step - (step - size)) / 2 + i * step;
    const gy = down ? y + i * step : y;
    return `<path transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${k.toFixed(4)})"
             d="${d}" fill="${fill}"/>`;
  }).join('');
}

// 접이문 한 짝. 사진을 확대해 보고 칸을 그대로 옮겼습니다.
//   위   크림색 격자 살 두 칸
//   가운데 유리 네 칸 (2×2) — 칸을 나누는 살은 흰색
//   아래  유리 없이 나무로 막힌 굽널 (문 높이의 1/4쯤)
// 칸이 모두 여섯이고 아래가 막혀 있는 것이 이 가게 문의 생김새입니다.
const DOOR_W = 56;
const DOOR_H = 150;

function toadDoor(x, seat = 0) {
  const m = 6.5;                 // 바깥 나무 문틀
  const bar = 2.2;               // 칸을 나누는 흰 살
  const IW = DOOR_W - m * 2;     // 창 자리 너비
  const cw = (IW - bar * 3) / 2; // 칸 하나 너비
  const HL = 26;                 // 격자 칸 높이
  const HG = 30;                 // 유리 칸 높이
  // 칸이 앉는 자리: 위에서부터 살·격자·살·유리·살·유리·살
  const y0 = 8;
  const winH = bar * 4 + HL + HG * 2;
  const r1 = y0 + bar;
  const r2 = r1 + HL + bar;
  const r3 = r2 + HG + bar;
  const cL = m + bar;
  const cR = cL + cw + bar;
  const cell = (px, py, h, fill) =>
    `<rect x="${px}" y="${py}" width="${cw}" height="${h}" fill="${fill}"/>`;
  // 유리 칸 = 유리 + 그 위에 얹는 불빛 한 겹. 불빛만 따로 밝아졌다 잦아듭니다.
  // 칸마다 시작을 조금씩 늦춰 두면 안에서 사람이 오가는 것처럼 물결칩니다.
  let lit = -1;
  const glass = (px, py) => {
    lit += 1;
    // 같은 세로줄(왼칸/오른칸)은 함께 켜집니다. 줄마다 시작을 당겨 두면
    // 불빛이 왼쪽에서 오른쪽으로 한 줄씩 훑고 지나갑니다.
    // 열여섯 칸이 저마다 천천히 오르내리면 전체 밝기가 늘 같아 눈에 안 띕니다.
    const d = (-(seat * 2 + (lit % 2)) * 0.55).toFixed(2);
    return cell(px, py, HG, 'url(#td-door)')
      + `<rect class="art-td__pane" style="--d:${d}s" x="${px}" y="${py}" width="${cw}" height="${HG}" fill="#FFE3AE"/>`;
  };
  return `<g transform="translate(${x} 158)">
    <rect width="${DOOR_W}" height="${DOOR_H}" fill="#A85A26"/>
    <rect width="${DOOR_W}" height="${DOOR_H}" fill="none" stroke="#7A3B18" stroke-width="2.6"/>

    <!-- 칸이 앉을 자리에 흰 살을 깔고 그 위에 칸을 올립니다.
         칸 둘레로 살이 ${bar}px 만 남습니다 — 더 넓으면 문짝이 흰 판처럼 보입니다. -->
    <rect x="${m}" y="${y0}" width="${IW}" height="${winH}" fill="#F2EADB"/>

    <!-- 위: 격자 살 두 칸 -->
    ${cell(cL, r1, HL, 'url(#td-lattice)')}${cell(cR, r1, HL, 'url(#td-lattice)')}
    <!-- 가운데·아래: 유리 네 칸 -->
    ${glass(cL, r2)}${glass(cR, r2)}
    ${glass(cL, r3)}${glass(cR, r3)}

    <!-- 그 아래는 유리 없이 나무로 막힌 굽널 -->
    <rect x="${m}" y="${y0 + winH + 6}" width="${IW}" height="34" fill="#9B4F1F"/>
    <rect x="${m}" y="${y0 + winH + 6}" width="${IW}" height="34" fill="none" stroke="#7A3B18" stroke-width="1.6"/>
    <path d="M${m + 3} ${y0 + winH + 12}h${IW - 6}" stroke="#BC6C31" stroke-width="1.2" opacity=".5"/>
  </g>`;
}

// 두 짝이 한 세트입니다. 세트와 세트 사이에는 흰 기둥이 섭니다.
// seat 은 불빛이 물결치는 차례입니다 — 왼쪽 짝부터 차례로 밝아집니다.
function toadDoorSet(x, seat) {
  return toadDoor(x, seat) + toadDoor(x + DOOR_W, seat + 1);
}

// 창 안에 앉은 사람들
function guests(pts) {
  return pts.map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})" fill="#40220F" opacity=".72">
    <circle cx="0" cy="-13" r="9"/>
    <path d="M-16 12c0-11 7-17 16-17s16 6 16 17z"/>
  </g>`).join('');
}

export const ART_TOAD = `
<svg class="art art--toad" viewBox="0 0 560 340" role="img" aria-label="풍덕천 두꺼비집 — 흰 간판에 남색 두꺼비집 글씨와 별이 둘린 두꺼비, 크림색 판벽에 불 켜진 창">
  <defs>
    <linearGradient id="td-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F6EACC"/><stop offset="1" stop-color="#E3D1A7"/>
    </linearGradient>
    <linearGradient id="td-sign" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFEFA"/><stop offset="1" stop-color="#EFE9DD"/>
    </linearGradient>
    <radialGradient id="td-glow"><stop offset="0" stop-color="#FFB65C" stop-opacity=".55"/><stop offset="1" stop-color="#FFB65C" stop-opacity="0"/></radialGradient>
    <linearGradient id="td-win" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFC782"/><stop offset="1" stop-color="#DE8A33"/>
    </linearGradient>
    <pattern id="td-floral" width="26" height="26" patternUnits="userSpaceOnUse">
      <rect width="26" height="26" fill="#F2E7D6"/>
      <g fill="#D7B096" opacity=".8">
        <circle cx="7" cy="7" r="2"/><circle cx="4.4" cy="4.4" r="1.5"/><circle cx="9.6" cy="4.4" r="1.5"/>
        <circle cx="4.4" cy="9.6" r="1.5"/><circle cx="9.6" cy="9.6" r="1.5"/>
        <circle cx="20" cy="19" r="2"/><circle cx="17.4" cy="16.4" r="1.5"/><circle cx="22.6" cy="16.4" r="1.5"/>
        <circle cx="17.4" cy="21.6" r="1.5"/><circle cx="22.6" cy="21.6" r="1.5"/>
      </g>
    </pattern>
    <pattern id="td-siding" width="14" height="15" patternUnits="userSpaceOnUse">
      <rect width="14" height="15" fill="url(#td-wall)"/>
      <rect y="13.4" width="14" height="1.6" fill="#C9B27F" opacity=".55"/>
    </pattern>
    <!-- 접이문 윗부분의 크림색 격자 살 -->
    <!-- 격자 살. 칸 하나가 19px 남짓이라 무늬는 그보다 훨씬 잘아야 짜임으로 보입니다. -->
    <pattern id="td-lattice" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#E9DCC2"/>
      <path d="M0 3.5h4M3.5 0v4" stroke="#AE9A66" stroke-width="1"/>
    </pattern>
    <linearGradient id="td-door" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DDA25B"/><stop offset="1" stop-color="#9E5C1D"/>
    </linearGradient>
    <linearGradient id="td-open" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFCE8D"/><stop offset="1" stop-color="#C9762C"/>
    </linearGradient>
    <clipPath id="td-glass"><rect x="96" y="158" width="132" height="142" rx="2"/></clipPath>
    <clipPath id="td-side"><rect x="484" y="158" width="64" height="142" rx="2"/></clipPath>
  </defs>

  <rect width="560" height="340" fill="#171520"/>

  <!-- 흰 간판 -->
  <g class="art-td__sign">
    <rect x="0" y="0" width="560" height="106" fill="url(#td-sign)"/>
    <text class="td-en" x="24" y="30">PUNG DEOK CHEON</text>
    <text class="td-en" x="24" y="52">TOAD HOUSE</text>
    <text class="td-en2" x="24" y="86">NEW TRO FOOD</text>
    <!-- 실제 간판은 벽에서 띄워 붙인 입체 글자입니다.
         흰 옆면이 글자를 빙 두르고(테두리), 벽에는 오른쪽 아래로 그림자가 집니다. -->
    <text class="td-small td-shadow" x="199" y="80">풍덕천</text>
    <text class="td-small" x="197" y="77">풍덕천</text>
    <text class="td-name td-shadow" x="259" y="83">두꺼비집</text>
    <text class="td-name" x="255" y="78">두꺼비집</text>
    ${toadMark(498, 47, 0.78)}
    <rect x="0" y="106" width="560" height="13" fill="#E8873A"/>
  </g>

  <!-- 크림색 차양과 처마 -->
  <rect x="0" y="119" width="560" height="24" fill="#EBD7A6"/>
  <rect x="0" y="139" width="560" height="6" fill="#C6A971"/>
  <g class="art-td__plate">
    <rect x="26" y="122" width="86" height="17" rx="2" fill="#17161A"/>
    <text class="td-plate" x="69" y="135" text-anchor="middle">두꺼비집</text>
  </g>

  <!-- 크림색 판벽 -->
  <rect x="0" y="145" width="560" height="195" fill="url(#td-siding)"/>

  <!-- 안에서 새어 나오는 불빛 -->
  <ellipse class="art-td__glow" cx="340" cy="238" rx="248" ry="126" fill="url(#td-glow)"/>

  <!-- 왼쪽 통유리창 — 흰 틀, 유리에 둥근 데칼 -->
  <g class="art-td__win">
    <rect x="96" y="158" width="132" height="142" rx="2" fill="#2A1D12"/>
    <g clip-path="url(#td-glass)">
      <rect x="96" y="158" width="132" height="142" fill="url(#td-floral)"/>
      <!-- 안쪽 그늘. 이걸 빼면 벽지가 너무 밝아 데칼도 사람도 날아갑니다 -->
      <rect x="96" y="158" width="132" height="142" fill="#7E4415" opacity=".46"/>
      <rect x="96" y="158" width="132" height="142" fill="url(#td-win)" opacity=".34"/>
      <!-- 안쪽 테이블과 앉은 손님 -->
      <g fill="#6E4520">
        <rect x="106" y="246" width="88" height="9" rx="3"/>
        <rect x="115" y="255" width="9" height="45"/><rect x="177" y="255" width="9" height="45"/>
      </g>
      ${guests([[131, 248, 1.04], [190, 252, 1.1]])}
      <!-- 유리에 붙은 둥근 TOADHOUSE 데칼.
           자리를 옮기는 <g> 와 움직이는 <g> 를 나눕니다 — 한 덩이에 두면
           호버에서 CSS transform 이 translate 를 덮어써 데칼이 구석으로 날아갑니다. -->
      <g transform="translate(162 212)"><g class="art-td__decal">
        <circle r="37" fill="none" stroke="#FFF8EC" stroke-width="3.2" opacity=".92"/>
        <circle r="30" fill="none" stroke="#FFF8EC" stroke-width="1.3" opacity=".7"/>
        <text class="td-decal" y="-6" text-anchor="middle">TOAD</text>
        <text class="td-decal" y="11" text-anchor="middle">HOUSE</text>
        <text class="td-decal-s" y="26" text-anchor="middle">DUKKEOBI</text>
      </g></g>
    </g>
    <rect x="96" y="158" width="132" height="142" rx="2" fill="none" stroke="#FBF6EA" stroke-width="7"/>
  </g>

  <!-- 접이문 — 두 짝이 한 세트, 세트가 둘. 사이에 흰 기둥이 섭니다. -->
  <g class="art-td__doors">
    ${toadDoorSet(238, 0)}
    <rect x="350" y="150" width="12" height="158" fill="#F4ECD9"/>
    <rect x="350" y="150" width="12" height="158" fill="none" stroke="#D3C3A0" stroke-width="1.4"/>
    ${toadDoorSet(362, 2)}
  </g>

  <!-- 문 오른쪽은 붙박이 유리 (문이 아닙니다) -->
  <g class="art-td__side">
    <rect x="484" y="158" width="64" height="142" rx="2" fill="#2A1D12"/>
    <g clip-path="url(#td-side)">
      <rect x="484" y="158" width="64" height="142" fill="url(#td-floral)"/>
      <rect x="484" y="158" width="64" height="142" fill="#7E4415" opacity=".42"/>
      <rect x="484" y="158" width="64" height="142" fill="url(#td-open)" opacity=".4"/>
      <g fill="#6E4520">
        <rect x="492" y="250" width="50" height="9" rx="3"/>
        <rect x="500" y="259" width="8" height="41"/><rect x="527" y="259" width="8" height="41"/>
      </g>
      ${guests([[516, 252, 1.02]])}
    </g>
    <rect x="484" y="158" width="64" height="142" rx="2" fill="none" stroke="#FBF6EA" stroke-width="7"/>
  </g>

  <!-- 왼쪽 벽에 걸린 세로 나무 간판.
       바닥까지 내리면 문으로 보입니다. 벽 중간에 걸고 아래로 판벽을 남깁니다. -->
  <g class="art-td__banner">
    <rect x="49" y="180" width="33" height="82" rx="1" fill="#1A0E06" opacity=".3"/>
    <rect x="47" y="176" width="33" height="82" rx="1" fill="#A34B25"/>
    <rect x="47" y="176" width="33" height="82" rx="1" fill="none" stroke="#7E3417" stroke-width="1.4"/>
    <rect x="49.5" y="178.5" width="28" height="77" rx="1" fill="none" stroke="#C4703F" stroke-width=".8" opacity=".5"/>
    <!-- 걸이못 -->
    <circle cx="63.5" cy="174" r="1.4" fill="#5E2A10"/>
    <!-- 글씨는 글꼴이 아니라 직접 그린 것입니다 (signWrite · SIGN_GLYPH) -->
    ${signWrite('풍덕천', 63.5, 181, 8, 9.4, '#38180A', false)}
    ${signWrite('두꺼비집', 63.5, 192.5, 15, 16.2, '#2E1206')}
  </g>

  <!-- 나무 데크와 검은 난간 -->
  <rect x="0" y="304" width="560" height="36" fill="#6B4A2C"/>
  <g stroke="#57381F" stroke-width="2"><path d="M0 314h560M0 326h560"/></g>
  <g stroke="#111015" stroke-width="5" stroke-linecap="round">
    <path d="M0 300h560M0 318h560"/>
    ${Array.from({ length: 15 }, (_, i) => `<path d="M${18 + i * 38} 296v44"/>`).join('')}
  </g>
</svg>`;

// ---------------------------------------------------------------- 메인 후원 간판
// 가게 간판을 보고 그대로 그렸습니다. 사진이 아니라 전부 그림입니다.
// 글꼴은 이 사이트가 쓰는 것으로 맞췄기 때문에 획의 맛은 조금 다르지만,
// 색과 배치, 들어가는 요소는 실제 간판 그대로입니다.

const SIGN_BOX = (body) =>
  `<svg class="sp__sign" viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;

export const SIGN = {
  // 부리또인 — 붉은 벽에 걸린 붉은 간판, 흰 테두리에 BURRITO ▣ N
  burritoin: SIGN_BOX(`
    <rect width="300" height="130" fill="#8E1712"/>
    <rect x="10" y="11" width="280" height="108" rx="14" fill="#C0201C"/>
    <rect x="10" y="11" width="280" height="108" rx="14" fill="none" stroke="#0E0B0C" stroke-width="3"/>
    <rect x="18" y="19" width="264" height="92" rx="9" fill="none" stroke="#F4EAD8" stroke-width="2"/>
    <text class="sg-burrito" x="34" y="74">BURRITO</text>
    <g transform="translate(196 42)">
      <rect width="30" height="36" rx="5" fill="#F4EAD8"/>
      <path d="M4 12h22" stroke="#C0201C" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M9 5q6-6 12 0z" fill="#C0201C"/>
      <circle cx="11" cy="20" r="1.9" fill="#C0201C"/><circle cx="19" cy="20" r="1.9" fill="#C0201C"/>
      <path d="M10 26q5 5 10 0" fill="none" stroke="#C0201C" stroke-width="2.4" stroke-linecap="round"/>
    </g>
    <text class="sg-burrito" x="234" y="74">N</text>
    <text class="sg-burrito-sub" x="150" y="98" text-anchor="middle">Mexican fusion cooking · 부리또 인</text>`),

  // 수원지동 순대국 — 노란 현수막, 파란 물결과 굵은 상호
  suwonjidong: SIGN_BOX(`
    <rect width="300" height="130" fill="#F2E94B"/>
    <rect x="4" y="4" width="292" height="122" fill="none" stroke="#0E0B0C" stroke-width="3"/>
    <text class="sg-suwon-a" x="20" y="76">수원지동</text>
    <text class="sg-suwon-b" x="172" y="76">순대국</text>
    <text class="sg-suwon-tel" x="150" y="110" text-anchor="middle">☎ 043-646-1723</text>`),

  // 포카츠 — 흰 벽에 붓으로 그린 그릇과 젓가락
  pokatsu: SIGN_BOX(`
    <rect width="300" height="130" fill="#F4F3ED"/>
    <g fill="none" stroke="#131313" stroke-linecap="round">
      <path d="M62 47h176" stroke-width="9" stroke-dasharray="62 8 40 7 68"/>
      <path d="M68 49A80 62 0 0 0 232 49" stroke-width="9" stroke-dasharray="78 9 52 8 132"/>
      <path d="M150 108v8" stroke-width="8"/>
      <path d="M131 121h38" stroke-width="9"/>
      <path d="M216 2L138 26" stroke-width="7" stroke-dasharray="32 6 46"/>
      <path d="M222 12L144 36" stroke-width="7" stroke-dasharray="38 6 40"/>
    </g>
    <text class="sg-pokatsu" x="150" y="86" text-anchor="middle">포카츠</text>
    <text class="sg-pokatsu-sub" x="150" y="103" text-anchor="middle">Pho'katsu</text>`),

  // 이가짬뽕 — 흰 현수막에 붉은 불꽃과 상호, 아래 붉은 띠
  igajjamppong: SIGN_BOX(`
    <rect width="300" height="130" fill="#F6F4F0"/>
    <rect x="4" y="4" width="292" height="122" fill="none" stroke="#0E0B0C" stroke-width="3"/>
    <text class="sg-jjam-small" x="150" y="30" text-anchor="middle">제천에서 가장 매운 짬뽕</text>
    <g transform="translate(38 44)">
      <path d="M20 0c3 9-2 13-6 17s-6 9-3 15c-7-2-11-8-10-15C2 8 14 6 20 0z" fill="#D8322F"/>
      <path d="M28 8c2 7-1 10-4 13s-4 7-2 12c-5-2-8-6-7-12 1-8 9-9 13-13z" fill="#F2A03C"/>
      <path d="M4 40h34l-4 14a5 5 0 0 1-5 4H13a5 5 0 0 1-5-4z" fill="#D8322F" stroke="#0E0B0C" stroke-width="2.6" stroke-linejoin="round"/>
    </g>
    <text class="sg-jjam-a" x="122" y="82">이가</text>
    <text class="sg-jjam-b" x="196" y="82">짬뽕</text>
    <rect x="4" y="102" width="292" height="24" fill="#D8322F"/>
    <text class="sg-jjam-tel" x="150" y="119" text-anchor="middle">043-756-7776</text>`),

  // 타임약국 — 간판만 카드에 꽉 채웁니다. 버터색 바탕에 검은 타임·약국,
  // 사이에 흰 약 자가 든 초록 십자. 유리문이나 매장까지 넣으면 간판이 작아집니다.
  // 타임은 끝(end), 약국은 시작 기준으로 십자(120~180)에서 같은 13만큼 떨어뜨려 십자가 두 단어 정중앙에 옵니다.
  // 간판 카드 칸은 그림 비율(300:130) 그대로라 잘리지 않습니다(sponsor-page.css). 그래도 테두리에 붙지 않게 양옆을 비워 둡니다.
  time: SIGN_BOX(`
    <rect width="300" height="130" fill="#F2DEA6"/>
    <rect x="0" y="0" width="300" height="7" fill="#DCC88A"/>
    <rect x="0" y="123" width="300" height="7" fill="#D6C07E"/>
    <text class="sg-time" x="109" y="84" text-anchor="end">타임</text>
    <g transform="translate(120 35)">
      <path d="M20 0h20v20h20v20H40v20H20V40H0V20h20z" fill="#2A7D3F"/>
      <text class="sg-time-cross" x="30" y="43" text-anchor="middle">약</text>
    </g>
    <text class="sg-time" x="190" y="84">약국</text>`),

    // 우자매순대국 — 흰 간판에 굵은 붓글씨 상호와 빨간 '가마솥' 도장.
  // 실제 간판 양 끝의 자매 사진 · 가마솥 사진은 넣지 않습니다(사진은 카드에 넣지 않습니다).
  // 카드 칸이 간판보다 훨씬 짧아서 상호 · 도장 · 손글씨 문구 · 전화 · 구름만 추렸습니다.
  woojamae: SIGN_BOX(`
    <rect width="300" height="130" fill="#F6F5F1"/>
    <rect width="300" height="5" fill="#DAD7CF"/>
    <rect y="125" width="300" height="5" fill="#DAD7CF"/>
    <g transform="translate(22 28) rotate(-11)">
      <text class="sg-wj-hand" x="0" y="0">시래기</text>
      <text class="sg-wj-hand" x="7" y="14">곤드레순대국</text>
    </g>
    <text class="sg-wj" x="127" y="88" text-anchor="middle">우자매 순대국</text>
    <g transform="translate(249 52) rotate(-8)">
      <rect x="-18" y="-18" width="36" height="36" rx="9" fill="#C9473B"/>
      <text class="sg-wj-seal" x="-7.5" y="6" text-anchor="middle">가</text>
      <text class="sg-wj-seal" x="7" y="-3" text-anchor="middle">마</text>
      <text class="sg-wj-seal" x="7" y="13" text-anchor="middle">솥</text>
    </g>
    <text class="sg-wj-tel" x="62" y="115">043) 645-2660  2호점</text>
    <g fill="none" stroke="#B8BBC3" stroke-width="1.7" stroke-linecap="round">
      <path d="M200 112q8-7 16-2t16-1q8-6 15 1t16 0"/>
      <path d="M210 119q9-5 18 0t18-1"/>
      <path d="M262 104a4 4 0 1 1 5 4"/>
      <path d="M214 105a3.4 3.4 0 1 1 4 3"/>
    </g>`),
};

export const ART = { yama: ART_YAMA, mimi: ART_MIMI, odi: ART_ODI, toad: ART_TOAD };
