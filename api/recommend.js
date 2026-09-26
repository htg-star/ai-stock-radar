const U = {
  KOSPI: [
    ["005930.KS","삼성전자"],["000660.KS","SK하이닉스"],["005380.KS","현대차"],
    ["035420.KS","NAVER"],["035720.KS","카카오"],["068270.KS","셀트리온"],
    ["105560.KS","KB금융"],["055550.KS","신한지주"],["066570.KS","LG전자"],
    ["096770.KS","SK이노베이션"]
  ],
  KOSDAQ: [
    ["247540.KQ","에코프로비엠"],["086520.KQ","에코프로"],["028300.KQ","HLB"],
    ["196170.KQ","알테오젠"],["263750.KQ","펄어비스"],["041510.KQ","에스엠"],
    ["214150.KQ","클래시스"],["145020.KQ","휴젤"]
  ],
  NASDAQ: [
    ["NVDA","NVIDIA"],["AAPL","Apple"],["MSFT","Microsoft"],["AMZN","Amazon"],
    ["GOOGL","Alphabet"],["META","Meta"],["AVGO","Broadcom"],["TSLA","Tesla"],
    ["AMD","AMD"],["NFLX","Netflix"],["MU","Micron"],["QCOM","Qualcomm"],
    ["PLTR","Palantir"],["CRWD","CrowdStrike"]
  ]
};

async function quote(symbol) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?range=1mo&interval=1d";

  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (!r.ok) throw new Error("Yahoo HTTP " + r.status);

  const json = await r.json();
  const result = json && json.chart && json.chart.result
    ? json.chart.result[0]
    : null;

  if (!result) throw new Error("No Yahoo result");

  const quoteData =
    result.indicators && result.indicators.quote
      ? result.indicators.quote[0]
      : {};

  const closes = (quoteData.close || []).filter(Number.isFinite);
  const volumes = (quoteData.volume || []).filter(Number.isFinite);

  if (closes.length < 2) return null;

  const price = closes[closes.length - 1];
  const previous = closes[closes.length - 2];

  const change = previous
    ? ((price / previous) - 1) * 100
    : 0;

  const start5 = closes.length > 5
    ? closes[closes.length - 6]
    : previous;

  const fiveDayChange = start5
    ? ((price / start5) - 1) * 100
    : change;

  const recentVolumes = volumes.slice(-21, -1);
  const averageVolume =
    recentVolumes.length
      ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
      : 1;

  const lastVolume = volumes.length
    ? volumes[volumes.length - 1]
    : averageVolume;

  const volumeRatio = lastVolume / Math.max(1, averageVolume);

  const momentum = Math.max(
    0,
    Math.min(100, Math.round(50 + fiveDayChange * 7))
  );

  const volumeScore = Math.max(
    0,
    Math.min(100, Math.round(volumeRatio * 25))
  );

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(momentum * 0.5 + volumeScore * 0.2 + 15)
    )
  );

  return {
    price: Number(price.toFixed(2)),
    change: Number(change.toFixed(2)),
    volumeRatio: Number(volumeRatio.toFixed(2)),
    momentum,
    newsScore: 50,
    score
  };
}

async function buildOne(market, stock) {
  try {
    const data = await quote(stock[0]);

    if (!data) return null;

    return {
      market,
      symbol: stock[0],
      name: stock[1],
      ...data
    };
  } catch (error) {
    return null;
  }
}

async function runBatch(list, size) {
  const out = [];

  for (let i = 0; i < list.length; i += size) {
    const batch = list.slice(i, i + size);

    const results = await Promise.all(
      batch.map(function(item) {
        return buildOne(item[0], item[1]);
      })
    );

    for (const item of results) {
      if (item) out.push(item);
    }
  }

  return out;
}

export default async function handler(req, res) {
  try {
    const requested =
      String(
        req && req.query && req.query.market
          ? req.query.market
          : "ALL"
      ).toUpperCase();

    let groups;

    if (requested === "ALL") {
      groups = Object.entries(U);
    } else if (U[requested]) {
      groups = [[requested, U[requested]]];
    } else {
      groups = Object.entries(U);
    }

    const jobs = [];

    for (const group of groups) {
      const market = group[0];
      const list = group[1];

      for (const stock of list) {
        jobs.push([market, stock]);
      }
    }

    // Too many simultaneous Yahoo requests can be throttled.
    // Process in small batches instead.
    const items = await runBatch(jobs, 6);

    items.sort(function(a, b) {
      return b.score - a.score;
    });

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=900"
    );

    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      market: requested,
      count: items.length,
      items: items.slice(0, 30)
    });

  } catch (error) {
    return res.status(200).json({
      ok: false,
      updatedAt: new Date().toISOString(),
      market: "ALL",
      count: 0,
      items: [],
      error: String(
        error && error.message
          ? error.message
          : error
      )
    });
  }
}
