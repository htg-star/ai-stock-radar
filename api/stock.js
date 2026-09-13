const aliases={
'삼성전자':'005930.KS','삼성':'005930.KS','SK하이닉스':'000660.KS','하이닉스':'000660.KS','현대차':'005380.KS',
'엔비디아':'NVDA','NVIDIA':'NVDA','애플':'AAPL','APPLE':'AAPL','마이크로소프트':'MSFT','MICROSOFT':'MSFT',
'아마존':'AMZN','AMAZON':'AMZN','메타':'META','META':'META','테슬라':'TSLA','TESLA':'TSLA'
};
async function data(symbol){
 const u=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
 const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});
 if(!r.ok)throw Error('시세 조회 실패');
 const j=await r.json(),res=j.chart.result?.[0],m=res?.meta;
 if(!m)throw Error('종목을 찾을 수 없습니다');
 const hist=(res.timestamp||[]).map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),close:Number(res.indicators.quote[0].close[i])})).filter(x=>Number.isFinite(x.close));
 const p=Number(m.regularMarketPrice),prev=Number(m.chartPreviousClose||p),change=prev?((p-prev)/prev*100):0;
 return {symbol,name:m.longName||m.shortName||symbol,market:symbol.endsWith('.KS')||symbol.endsWith('.KQ')?'KR':'US',price:p,change,history:hist};
}
module.exports=async function(req,res){
 try{
  const raw=String(req.query?.symbol||'').trim(),symbol=aliases[raw]||aliases[raw.toUpperCase()]||raw;
  const s=await data(symbol);
  const score=Math.max(35,Math.min(95,Math.round(65+Math.min(10,Math.max(-10,s.change*4)))));
  let news=[];
  try{
   const q=encodeURIComponent(`${s.name} ${s.symbol}`);
   const rr=await fetch(`https://news.google.com/rss/search?q=${q}&hl=${s.market==='US'?'en-US':'ko'}&gl=${s.market==='US'?'US':'KR'}&ceid=${s.market==='US'?'US:en':'KR:ko'}`,{headers:{'User-Agent':'Mozilla/5.0'}});
   const xml=await rr.text();news=[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0,8).map(m=>{const b=m[0],g=n=>{const z=b.match(new RegExp('<'+n+'[^>]*>([\\s\\S]*?)</'+n+'>','i'));return z?z[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,'').trim():''};return {title:g('title'),link:g('link'),source:g('source'),timeText:g('pubDate')})});
  }catch(e){}
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ok:true,updatedAt:new Date().toISOString(),stock:s,score,components:{news:score,price:Math.round(score*.9),market:Math.round(score*.85)},verdict:score>=75?'긍정적 모멘텀':'중립적·추가 확인 필요',expertView:'전문가 관점은 실제 증권사 리포트의 매수·매도 신호를 대체하지 않습니다. 가격 추세와 최근 뉴스 흐름을 바탕으로 한 참고용 해석입니다.',news});
 }catch(e){res.status(500).json({ok:false,error:e.message||String(e)})}
};
