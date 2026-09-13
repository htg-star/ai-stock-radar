const clean = (s='') => String(s).replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();

function imageFrom(n){
  return n.thumbnail?.resolutions?.[0]?.url || n.thumbnail?.url || n.image?.url || n.image || '';
}

async function yahooNews(q){
  const url='https://query1.finance.yahoo.com/v1/finance/search?q='+encodeURIComponent(q)+'&quotesCount=0&newsCount=25';
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 AI-Stock-Radar/6.0','Accept':'application/json'}});
  if(!r.ok) throw new Error('Yahoo News HTTP '+r.status);
  const j=await r.json();
  return (j.news||[]).map(n=>({
    title:clean(n.title||''), link:n.link||n.clickThroughUrl||'', source:clean(n.publisher||n.providerPublishTime?'':(n.publisher||'')),
    pubDate:n.providerPublishTime?new Date(n.providerPublishTime*1000).toISOString():'', image:imageFrom(n),
    category:'MARKET'
  })).filter(n=>n.title&&n.link);
}

async function googleNews(q,lang){
  const us=lang==='en';
  const u='https://news.google.com/rss/search?'+new URLSearchParams({q:q+' when:3d',hl:us?'en-US':'ko',gl:us?'US':'KR',ceid:us?'US:en':'KR:ko'}).toString();
  const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 AI-Stock-Radar/6.0'}});
  if(!r.ok) throw new Error('Google News HTTP '+r.status);
  const x=await r.text();
  const blocks=[...x.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]).slice(0,30);
  const tag=(b,n)=>{const m=b.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+n+'>','i'));return m?clean(m[1]):''};
  return blocks.map(b=>({title:tag(b,'title'),link:tag(b,'link'),source:tag(b,'source')||'Google News',pubDate:tag(b,'pubDate'),image:((tag(b,'description').match(/<img[^>]+src=["']([^"']+)/i)||[])[1]||''),category:'MARKET'})).filter(n=>n.title&&n.link);
}

function categorize(items){return items.map(n=>{if(/AI|반도체|HBM|GPU|NVIDIA|AMD|chip|semiconductor|OpenAI|데이터센터/i.test(n.title))n.category='TECH';else if(/금리|환율|연준|Fed|물가|국채|채권|rate|inflation|yield|달러|원화/i.test(n.title))n.category='MACRO';else if(/유가|원유|에너지|oil|energy|원전|전력/i.test(n.title))n.category='ENERGY';else n.category='MARKET';n.timeText=n.pubDate?new Date(n.pubDate).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';return n;});}

module.exports=async function(req,res){
  try{
    const q=String(req.query?.q||'주식 증시 금융시장');
    const lang=String(req.query?.lang||'ko').toLowerCase()==='en'?'en':'ko';
    let items=[];
    try{items=await yahooNews(q);}catch(e){items=[];}
    if(items.length<5){try{items=items.concat(await googleNews(q,lang));}catch(e){}}
    const seen=new Set(); items=categorize(items).filter(n=>{const k=n.title.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate)).slice(0,30);
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ok:true,updatedAt:new Date().toISOString(),query:q,lang,count:items.length,news:items});
  }catch(e){res.status(200).json({ok:false,updatedAt:new Date().toISOString(),query:String(req.query?.q||''),count:0,news:[],error:e.message||String(e)});}
};
