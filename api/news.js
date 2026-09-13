const clean = (s = '') =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
   .replace(/<[^>]+>/g, '')
   .replace(/&amp;/g, '&')
   .replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'")
   .replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>')
   .trim();

const tag = (block, name) => {
  const m = block.match(
    new RegExp(
      '<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>',
      'i'
    )
  );

  return m ? m[1] : '';
};

async function fetchNews(q, lang = 'ko') {
  const isUS = lang === 'en';

  const params = new URLSearchParams({
    q: `${q} when:2d`,
    hl: isUS ? 'en-US' : 'ko',
    gl: isUS ? 'US' : 'KR',
    ceid: isUS ? 'US:en' : 'KR:ko'
  });

  const url =
    `https://news.google.com/rss/search?${params.toString()}`;

  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; AI-Stock-Radar/5.0)'
    }
  });

  if (!r.ok) {
    throw new Error(`Google News RSS HTTP ${r.status}`);
  }

  const xml = await r.text();

  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)
  ]
    .map(m => m[0])
    .slice(0, 40);

  return blocks
    .map(block => {
      const title = clean(tag(block, 'title'));
      const link = clean(tag(block, 'link'));
      const pubDate = clean(tag(block, 'pubDate'));
      const source =
        clean(tag(block, 'source')) || 'Google News';

      const descriptionRaw = tag(block, 'description');

      const imageMatch = descriptionRaw.match(
        /<img[^>]+(?:src|srcset)=["']([^"']+)["']/i
      );

      const image = imageMatch
        ? imageMatch[1]
        : '';

      let category = 'MARKET';

      if (
        /AI|반도체|HBM|GPU|NVIDIA|AMD|chip|semiconductor|OpenAI|데이터센터/i.test(
          title
        )
      ) {
        category = 'TECH';
      } else if (
        /금리|환율|연준|Fed|물가|국채|채권|rate|inflation|yield|달러|원화/i.test(
          title
        )
      ) {
        category = 'MACRO';
      } else if (
        /유가|원유|에너지|oil|energy|원전|전력/i.test(
          title
        )
      ) {
        category = 'ENERGY';
      }

      let timeText = '';

      if (pubDate) {
        const d = new Date(pubDate);

        if (!Number.isNaN(d.getTime())) {
          timeText = d.toLocaleString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }

      return {
        title,
        link,
        pubDate,
        source,
        image,
        category,
        timeText
      };
    })
    .filter(item => item.title && item.link);
}

export default async function handler(req, res) {
  try {
    const q = String(
      req.query?.q ||
        '주식 증시 AI 반도체 금리 환율 미국주식 한국주식'
    );

    const lang =
      String(req.query?.lang || 'ko').toLowerCase() === 'en'
        ? 'en'
        : 'ko';

    const items = await fetchNews(q, lang);

    res.setHeader(
      'Cache-Control',
      's-maxage=300, stale-while-revalidate=600'
    );

    res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      query: q,
      lang,
      count: items.length,
      news: items
    });
  } catch (e) {
    console.error('news.js error:', e);

    res.status(500).json({
      ok: false,
      updatedAt: new Date().toISOString(),
      error: e?.message || String(e),
      news: []
    });
  }
}
