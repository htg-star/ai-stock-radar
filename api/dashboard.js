const STOCKS = [
  ["삼성전자", "005930.KS", "KR"],
  ["SK하이닉스", "000660.KS", "KR"],
  ["LG에너지솔루션", "373220.KS", "KR"],
  ["현대차", "005380.KS", "KR"],
  ["NAVER", "035420.KS", "KR"],
  ["카카오", "035720.KS", "KR"],
  ["한미반도체", "042700.KQ", "KR"],
  ["에코프로비엠", "247540.KQ", "KR"],
  ["에코프로", "086520.KQ", "KR"],
  ["알테오젠", "196170.KQ", "KR"],
  ["NVIDIA", "NVDA", "US"],
  ["Apple", "AAPL", "US"],
  ["Microsoft", "MSFT", "US"],
  ["Amazon", "AMZN", "US"],
  ["Alphabet", "GOOGL", "US"],
  ["Meta", "META", "US"],
  ["Tesla", "TSLA", "US"],
  ["AMD", "AMD", "US"],
  ["Broadcom", "AVGO", "US"]
];

const MARKETS = {
  NASDAQ: "^IXIC",
  KOSPI: "^KS11",
  KOSDAQ: "^KQ11",
  SP500: "^GSPC",
  USDKRW: "KRW=X"
};

async function getYahoo(symbol) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?range=5d&interval=1d";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Yahoo Finance error: " + symbol);
  }

  const json = await response.json();
  const result = json.chart && json.chart.result
    ? json.chart.result[0]
    : null;

  if (!result) {
    throw new Error("No data: " + symbol);
  }

  const meta = result.meta || {};
  const price =
    typeof meta.regularMarketPrice === "number"
      ? meta.regularMarketPrice
      : null;

  const previous =
    typeof meta.previousClose === "number"
      ? meta.previousClose
      : null;

  const change =
    price !== null && previous
      ? ((price - previous) / previous) * 100
      : 0;

  return {
    price: price,
    change: change
  };
}

function makeScore(change) {
  const value = 50 + (Number(change) || 0) * 8;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function getStock(stock) {
  const name = stock[0];
  const symbol = stock[1];
  const market = stock[2];

  try {
    const data = await getYahoo(symbol);
    const aiScore = makeScore(data.change);

    return {
      name: name,
      symbol: symbol,
      market: market,
      price: data.price,
      change: data.change,
      aiScore: aiScore,
      expertScore: Math.round(aiScore * 0.9 + 5),
      status: data.change >= 0 ? "상승" : "하락"
    };
  } catch (error) {
    return {
      name: name,
      symbol: symbol,
      market: market,
      price: null,
      change: null,
      aiScore: null,
      expertScore: null,
      status: "데이터 없음"
    };
  }
}

async function getMarket(name, symbol) {
  try {
    const data = await getYahoo(symbol);

    return {
      name: name,
      symbol: symbol,
      price: data.price,
      change: data.change,
      status: data.change >= 0 ? "상승" : "하락"
    };
  } catch (error) {
    return {
      name: name,
      symbol: symbol,
      price: null,
      change: null,
      status: "데이터 없음"
    };
  }
}

module.exports = async function handler(req, res) {
  try {
    const marketList = await Promise.all(
      Object.keys(MARKETS).map(function(name) {
        return getMarket(name, MARKETS[name]);
      })
    );

    const stocks = await Promise.all(
      STOCKS.map(function(stock) {
        return getStock(stock);
      })
    );

    const picks = stocks
      .filter(function(stock) {
        return stock.aiScore !== null;
      })
      .sort(function(a, b) {
        return b.aiScore - a.aiScore;
      })
      .slice(0, 10);

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),

      market: marketList,
      markets: marketList,

      stocks: stocks,

      picks: picks,
      topPicks: picks
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: String(error && error.message ? error.message : error),

      market: [],
      markets: [],
      stocks: [],
      picks: [],
      topPicks: []
    });
  }
};
