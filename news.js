const clean=s=>(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const tag=(b,n)=>{const m=b.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+n+'>','i'));return m?m[1]:''};
async function google(q,lang){
 const us=lang==='en';
 const url='https://news.google.com/rss/search?'+new URLSearchParams({q:q+' when:2d',hl:us?'en-US':'ko',gl:us?'US':'KR',ceid:us?'US:en':'KR:ko'});
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
 if(!r.ok)throw Error('Google News RSS HTTP '+r.status);
 const xml=await r.text();
 return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]).slice(0,40).map(b=>{
  const title=clean(tag(b,'title')),link=clean(tag(b,'link')),pubDate=clean(tag(b,'pubDate')),source=clean(tag(b,'source'))||'Google News',desc=tag(b,'description');
  const im=desc.match(/<img[^>]+src=["']([^"']+)/i);
  return {title,link,pubDate,source,image:im?im[1]:'',category:'MARKET',timeText:pubDate?new Date(pubDate).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):''};
 }).filter(x=>x.title&&x.link);
}
module.exports=async function(req,res){
 try{
  const q=String(req.query?.q||'stocks finance economy Korea US'),lang=String(req.query?.lang||'ko')==='en'?'en':'ko';
  const news=await google(q,lang);
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ok:true,updatedAt:new Date().toISOString(),count:news.length,news});
 }catch(e){res.status(500).json({ok:false,error:e.message||String(e),news:[]})}
};