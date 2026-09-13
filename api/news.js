function clean(s='') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
}
function tag(block,name){
  const m=block.match(new RegExp('<'+name+'[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'));
  return clean(m?.[1]||'');
}
async function getFeed(q, lang='ko'){
  const us=lang==='en';
  const url='https://news.google.com/rss/search?q='+encodeURIComponent(q+' when:2d')+'&hl='+(us?'en-US':'ko')+'&gl='+(us?'US':'KR')+'&ceid='+(us?'US:en':'KR:ko');
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!r.ok) throw new Error('Google News RSS '+r.status);
  const xml=await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,50).map(m=>{
    const b=m[1], title=tag(b,'title'), link=tag(b,'link'), pubDate=tag(b,'pubDate'), source=tag(b,'source')||'Google News', desc=tag(b,'description');
    let category='MARKET';
    if(/AI|반도체|HBM|GPU|NVIDIA|AMD|chip|semiconductor|OpenAI|TSMC/i.test(title)) category='TECH';
    else if(/금리|환율|연준|Fed|물가|국채|채권|rate|inflation|yield|CPI|FOMC/i.test(title)) category='MACRO';
    else if(/유가|원유|에너지|oil|energy|OPEC/i.test(title)) category='ENERGY';
    return {title,link,pubDate,source,category,description:desc,timeText:pubDate?new Date(pubDate).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):''};
  }).filter(x=>x.title&&x.link);
}
export default async function handler(req,res){
  try{
    const q=String(req.query?.q||'주식 증시 반도체 AI 금리 환율 미국주식 한국주식');
    const lang=String(req.query?.lang||'ko')==='en'?'en':'ko';
    const news=await getFeed(q,lang);
    res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=300');
    res.status(200).json({ok:true,updatedAt:new Date().toISOString(),count:news.length,news});
  }catch(e){res.status(200).json({ok:false,updatedAt:new Date().toISOString(),error:e.message,news:[]});}
}
