/*
 AI Stock Radar - recommend.js V12

 목적:
 - 기존처럼 몇 개의 종목을 하드코딩해서 추천하지 않음
 - 미국: Yahoo Finance 스크리너에서 여러 후보군을 가져와 폭넓게 스캔
 - 한국: Yahoo Finance의 한국 지역 스크리너를 우선 시도하고,
         실패한 경우 대표 한국 종목으로 안전하게 fallback
 - KOSDAQ만 / KOSPI만 / NASDAQ만 보는 구조가 아니라
   KOREA / USA 전체 후보를 하나의 추천 풀로 합침
 - dashboard.js는 사용하지 않음. 현재 프론트의 /api/recommend 호출과 호환
*/

const FALLBACK = [
  ["삼성전자","005930.KS","KOREA"],
  ["SK하이닉스","000660.KS","KOREA"],
  ["현대차","005380.KS","KOREA"],
  ["NAVER","035420.KS","KOREA"],
  ["카카오","035720.KS","KOREA"],
  ["셀트리온","068270.KS","KOREA"],
  ["LG에너지솔루션","373220.KS","KOREA"],
  ["삼성바이오로직스","207940.KS","KOREA"],
  ["에코프로비엠","247540.KQ","KOREA"],
  ["에코프로","086520.KQ","KOREA"],
  ["알테오젠","196170.KQ","KOREA"],
  ["HLB","028300.KQ","KOREA"],
  ["NVIDIA","NVDA","USA"],
  ["Apple","AAPL","USA"],
  ["Microsoft","MSFT","USA"],
  ["Amazon","AMZN","USA"],
  ["Alphabet","GOOGL","USA"],
  ["Meta","META","USA"],
  ["Tesla","TSLA","USA"],
  ["AMD","AMD","USA"],
  ["Broadcom","AVGO","USA"],
  ["Micron","MU","USA"],
  ["Palantir","PLTR","USA"],
  ["Netflix","NFLX","USA"]
];

function num(v, fallback=0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}

function normalizeQuote(q, market) {
  const symbol = q.symbol || q.ticker || q.shortName;
  if (!symbol) return null;

  const price = num(
    q.regularMarketPrice ??
    q.postMarketPrice ??
    q.preMarketPrice
  );

  const change = num(
    q.regularMarketChangePercent ??
    q.percentchange
  );

  const volume = num(
    q.regularMarketVolume ??
    q.dayvolume ??
    q.volume
  );

  const avgVolume = num(
    q.averageDailyVolume3Month ??
    q.avgdailyvol3m
  );

  const momentum = Math.max(
    0,
    Math.min(100, Math.round(50 + change * 7))
  );

  const volumeScore = avgVolume > 0
    ? Math.max(0, Math.min(100, Math.round((volume / avgVolume) * 50)))
    : 50;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(momentum * 0.55 + volumeScore * 0.20 + 50 * 0.25)
    )
  );

  return {
    symbol,
    name: q.longName || q.shortName || q.displayName || symbol,
    market,
    price,
    change: Number(change.toFixed(2)),
    volumeRatio: avgVolume > 0 ? Number((volume / avgVolume).toFixed(2)) : 1,
    momentum,
    newsScore: 50,
    score
  };
}

async function getScreener(scrId, region, lang) {
  const url =
    "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved" +
    "?formatted=false" +
    "&lang=" + encodeURIComponent(lang) +
    "&region=" + encodeURIComponent(region) +
    "&scrIds=" + encodeURIComponent(scrId) +
    "&count=250";

  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 AI-Stock-Radar/1.0",
      "Accept": "application/json,text/plain,*/*"
    }
  });

  if (!r.ok) throw new Error("Screener HTTP " + r.status);

  const data = await r.json();
  return data?.finance?.result?.[0]?.quotes || [];
}

async function getChart(symbol) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?range=1mo&interval=1d";

  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 AI-Stock-Radar/1.0" }
  });

  if (!r.ok) throw new Error("Chart HTTP " + r.status);

  const j = await r.json();
  const result = j?.chart?.result?.[0];
  const meta = result?.meta;

  if (!meta) throw new Error("No chart data");

  const closes = (result?.indicators?.quote?.[0]?.close || [])
    .filter(Number.isFinite);

  const volumes = (result?.indicators?.quote?.[0]?.volume || [])
    .filter(Number.isFinite);

  const price =
    Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : closes.at(-1);

  if (!Number.isFinite(price) || closes.length < 2) {
    throw new Error("Insufficient chart data");
  }

  const previous =
    Number.isFinite(meta.previousClose)
      ? meta.previousClose
      : closes.at(-2);

  const change = previous
    ? ((price - previous) / previous) * 100
    : 0;

  const start5 = closes.length > 5
    ? closes[closes.length - 6]
    : closes[0];

  const return5 = start5
    ? ((price - start5) / start5) * 100
    : change;

  const avgVolumeValues = volumes.slice(-21, -1);
  const avgVolume = avgVolumeValues.length
    ? avgVolumeValues.reduce((a,b) => a + b, 0) / avgVolumeValues.length
    : 0;

  const volume = volumes.at(-1) || 0;

  return {
    price,
    change,
    return5,
    volumeRatio: avgVolume > 0 ? volume / avgVolume : 1
  };
}

async function enrich(items, limit=80) {
  const unique = [];
  const seen = new Set();

  for (const x of items) {
    const symbol = x.symbol || x.ticker;
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    unique.push(x);
  }

  const result = [];

  // Yahoo/Vercel에 과도한 동시 요청을 보내지 않도록 8개씩 처리
  for (let i = 0; i < Math.min(unique.length, limit); i += 8) {
    const batch = unique.slice(i, i + 8);

    const rows = await Promise.all(
      batch.map(async item => {
        try {
          const c = await getChart(item.symbol);

          const momentum = Math.max(
            0,
            Math.min(
              100,
              Math.round(50 + c.return5 * 6 + c.change * 3)
            )
          );

          const volumeScore = Math.max(
            0,
            Math.min(
              100,
              Math.round(c.volumeRatio * 50)
            )
          );

          const score = Math.max(
            0,
            Math.min(
              100,
              Math.round(
                momentum * 0.55 +
                volumeScore * 0.20 +
                50 * 0.25
              )
            )
          );

          return {
            symbol: item.symbol,
            name: item.name || item.shortName || item.symbol,
            market: item.market,
            price: Number(c.price.toFixed(2)),
            change: Number(c.change.toFixed(2)),
            volumeRatio: Number(c.volumeRatio.toFixed(2)),
            momentum,
            newsScore: 50,
            score
          };
        } catch (_) {
          return null;
        }
      })
    );

    for (const row of rows) {
      if (row) result.push(row);
    }
  }

  return result;
}

function fallbackItems() {
  return FALLBACK.map(([name, symbol, market]) => ({
    name,
    symbol,
    market
  }));
}

export default async function handler(req, res) {
  const requested = String(req.query?.market || "ALL").toUpperCase();

  let candidates = [];

  // 미국 전체에 가까운 후보군: 거래활발 + 상승 + 하락 후보를 합침
  if (requested === "ALL" || requested === "USA" || requested === "NASDAQ") {
    for (const id of ["most_actives", "day_gainers", "day_losers"]) {
      try {
        const quotes = await getScreener(id, "US", "en-US");
        candidates.push(
          ...quotes.map(q => normalizeQuote(q, "USA")).filter(Boolean)
        );
      } catch (_) {}
    }
  }

  // 한국 후보군. Yahoo가 지역 KR screener를 제공하는 경우 최대 250개씩 확보.
  if (requested === "ALL" || requested === "KOREA" ||
      requested === "KOSPI" || requested === "KOSDAQ") {
    for (const id of ["most_actives", "day_gainers", "day_losers"]) {
      try {
        const quotes = await getScreener(id, "KR", "ko-KR");
        candidates.push(
          ...quotes.map(q => normalizeQuote(q, "KOREA")).filter(Boolean)
        );
      } catch (_) {}
    }
  }

  // 스크리너가 막혀도 사이트가 빈 화면이 되지 않도록 fallback 추가
  if (!candidates.length) {
    candidates = fallbackItems();
  } else {
    // 대표 종목도 함께 추가하여 검색/추천 공백을 줄임
    candidates.push(...fallbackItems());
  }

  // 현재 UI의 KOSPI/KOSDAQ/NASDAQ 버튼도 깨지지 않게 호환 필터
  if (requested === "KOSPI") {
    candidates = candidates.filter(x =>
      x.market === "KOREA" && /\.KS$/i.test(x.symbol)
    );
  } else if (requested === "KOSDAQ") {
    candidates = candidates.filter(x =>
      x.market === "KOREA" && /\.KQ$/i.test(x.symbol)
    );
  } else if (requested === "NASDAQ") {
    candidates = candidates.filter(x => x.market === "USA");
  } else if (requested === "KOREA") {
    candidates = candidates.filter(x => x.market === "KOREA");
  } else if (requested === "USA") {
    candidates = candidates.filter(x => x.market === "USA");
  }

  const enriched = await enrich(candidates, 80);

  // enrich 실패 시 fallback을 최소한 반환
  let items = enriched;

  if (!items.length) {
    items = fallbackItems().map(x => ({
      ...x,
      price: null,
      change: null,
      volumeRatio: 1,
      momentum: 50,
      newsScore: 50,
      score: 50
    }));
  }

  items.sort((a,b) => b.score - a.score);

  res.setHeader(
    "Cache-Control",
    "s-maxage=300, stale-while-revalidate=900"
  );

  return res.status(200).json({
    ok: true,
    updatedAt: new Date().toISOString(),
    market: requested,
    universe: requested === "ALL" ? "KOREA + USA" : requested,
    count: items.length,
    items: items.slice(0, 30)
  });
}
