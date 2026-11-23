# I.F 2026 LIVE PERFORMANCE — 공연 홍보 사이트

세명대학교 라이브공연 동아리 I.F, 2026.11.05 청춘싸롱. 주소: https://ifband.kro.kr

## 구조

```
site/
  index.html          섹션 마크업 (네비 / 히어로 / INFO / SETLIST / NOTICE / SPONSOR / 푸터)
  css/tokens.css      색 4개 + 글자 7단계 + 간격. 여기 없는 값은 쓰지 않는다
  css/base.css        리셋, 타입 클래스, 버튼/테이프/카드/네온/마키 공용 부품
  css/sections.css    섹션별 레이아웃과 반응형 (1280 / 1024 / 640)
  js/main.js          data/*.json 로드 → data-ev 바인딩 → 섹션 모듈 init
  js/*.js             섹션별 모듈 (nav, hero, countdown, info, setlist, notice, sponsors, share)
  data/event.json     공연 정보 한 곳 (날짜, 장소, 티켓, 연락처, 인스타, 사이트 주소)
  data/setlist.json   무대별 곡 목록 + 유튜브 링크
  data/sponsors.json  후원사 두 줄
  data/notices.json   유의사항
  assets/             포스터(480/800/1200), 로고, OG 이미지, 파비콘
```

빌드 없음. 정적 파일 그대로 서빙한다. `fetch`로 JSON을 읽으므로 `file://`이 아니라 http로 열어야 한다.

## 로컬 미리보기

```
cd site
py -m http.server 8080
```
→ http://localhost:8080

## 내용 수정 (동아리원용)

- 셋리스트: `data/setlist.json` 의 artist / title / youtube 만 고친다. youtube 에 링크를 넣으면 곡 카드에서 재생된다.
- 후원사: `data/sponsors.json` 의 rows 에 이름을 넣는다. category(식당/주점/노래방/카페)와 map 링크는 선택.
- 공연 정보, 가격, 연락처: `data/event.json`
- 유의사항 문구: `data/notices.json`

## 규칙 (개발자용)

- 색은 `--ink --paper --pink --mint --red` 만. 네온(`.glow-pink .tube-pink`)은 TONIGHT 배지, NOW PLAYING, 푸터 문구 세 곳만.
- 글자 크기는 `--fs-*` 7단계만. 14px 아래 금지.
- 모션은 `prefers-reduced-motion` 을 존중한다 (`reducedMotion()` 확인).
- 사운드 없음.
- 외부 스크립트는 GSAP, ScrollTrigger, Lenis 세 개만 (CDN).

## 토큰 예외
- 카운트다운 숫자(`--fs-count` 56/48/32)와 스티커 배지 D-day(`--fs-badge` 64/56/40)는 7단계 밖의 전용 크기입니다. 다른 곳에 쓰지 않습니다.
- `--white`는 종이 카드 위의 흰 버튼 면과 네온 글자 중심광에만 씁니다.

## 디버그 훅 (운영에 무해)
- `?shot=1` 히어로 높이 고정 해제 + 스크롤 등장 모션 끔 (전체 페이지 스크린샷용). `&motion=force` 를 붙이면 등장 경로를 실제로 태움.
- `?now=2026-11-05T21:40:00+09:00` 그 시각을 "지금"으로 간주 (셋리스트 NOW PLAYING, 카운트다운 LIVE 상태 확인용).
