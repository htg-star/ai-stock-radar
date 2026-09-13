const clean=s=>(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').trim();

async function fetchNews(q, lang='ko'){
  const isUS = lang === 'en';
  const url =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(q + ' when:2d') +
    '&hl=' + (isUS ? 'en-US' : 'ko') +
    '&gl=' + (isUS ? 'US' : 'KR') +
    '&ceid=' + (isUS ? 'US:en' : 'KR:ko');

  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!r.ok) throw Error('뉴스 조회 실패');

  const x=await r.text();
  const blocks=[...x.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(z=>z[1]).slice(0,40);

  const get=(b,n)=>clean(
    (b.match(new RegExp('<'+n+'[^>]*>([\\s\\S]*?)<\\/'+n+'>','i'))||[])[1]
  );

  return blocks.map(b=>{
    const title=get(b,'title');
    const link=get(b,'link');
    const pubDate=get(b,'pubDate');
    const source=get(b,'source')||'Google News';
    const desc=get(b,'description');
    const image=(desc.match(/<img[^>]+src=["']([^"']+)/i)||[])[1]||'';

    let category='MARKET';
    if(/AI|반도체|HBM|GPU|NVIDIA|AMD|chip|semiconductor/i.test(title))
      category='TECH';
    else if(/금리|환율|연준|Fed|물가|국채|채권|rate|inflation|yield/i.test(title))
      category='MACRO';
    else if(/유가|원유|에너지|oil|energy/i.test(title))
      category='ENERGY';

    return {
      title, link, pubDate, source, image, category,
      timeText: pubDate
        ? new Date(pubDate).toLocaleString('ko-KR',{
            month:'numeric',day:'numeric',
            hour:'2-digit',minute:'2-digit'
          })
        : ''
    };
  }).filter(x=>x.title&&x.link);
}

export default async function handler(req,res){
  try{
    const q=(req.query?.q||'주식 증시 AI 반도체 금리 환율 미국주식 한국주식').toString();
    const lang=(req.query?.lang||'ko').toString();
    const items=await fetchNews(q,lang);

    res.setHeader('Cache-Control','no-store');
    res.status(200).json({
      updatedAt:new Date().toISOString(),
      query:q,
      count:items.length,
      news:items
    });
  }catch(e){
    res.status(500).json({
      updatedAt:new Date().toISOString(),
      error:String(e),
      news:[]
    });
  }
}
