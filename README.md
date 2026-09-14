# AI Stock Radar v8
기존 v7의 복잡한 부분을 제거한 단순 구조입니다.

```text
/
├─ index.html
├─ vercel.json
└─ api/
   ├─ dashboard.js
   └─ news.js
```

- `api/stock.js` 불필요 → 삭제
- rewrite 제거
- 모든 API를 `module.exports`로 통일
- 프론트는 `/api/dashboard`, `/api/news`만 호출
- 종목 검색/TOP PICKS 클릭 → AI 점수, 지표, 가격 그래프, 참고용 전문가 관점
- 한국/미국 뉴스 메뉴
- Yahoo Finance + Google News RSS
- 5분 자동 갱신

중요: `dashboard.js`와 `news.js`는 루트가 아니라 반드시 `api` 폴더 안에 있어야 합니다.
