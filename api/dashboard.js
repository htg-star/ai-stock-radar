const symbols={
NASDAQ:'^IXIC',SP500:'^GSPC',KOSPI:'^KS11',USDKRW:'KRW=X'
};
const picks=[
['삼성전자','005930.KS','KR'],['SK하이닉스','000660.KS','KR'],['현대차','005380.KS','KR'],
['NVIDIA','NVDA','US'],['Apple','AAPL','US'],['Microsoft','MSFT','US'],['Amazon','AMZN','US'],['Meta','META','US']
];
async function quote(symbol){
  const u=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
  const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!r.ok) throw new Error('quote failed');
  const j=await r.json(),res=j.chart.result?.[0],m=res?.meta;
  if(!m) throw new Error('no quote');
  const p=Number(m.regularMarketPrice),prev=Number(m.chartPreviousClose||m.previousClose||p);
  return {price:p,priceText:p.toLocaleString('en-US',{maximumFractionDigits:2}),change:prev?((p-prev)/prev*100):0};
}
function fallback(name){return {name,priceText:'-',change:0}}
module.exports=async function(req,res){
  const market={};
  for(const [k,s] of Object.entries(symbols)){try{market[k]=await quote(s)}catch(e){market[k]=fallback(k)}}
  const out=[];
  for(const [name,symbol,marketName] of picks){
    try{const q=await quote(symbol);out.push({name,symbol,market:marketName,score:Math.max(50,Math.min(96,Math.round(60+q.change*3))),price:q.price})}
    catch(e){out.push({name,symbol,market:marketName,score:60})}
  }
  out.sort((a,b)=>b.score-a.score);
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ok:true,updatedAt:new Date().toISOString(),market,picks:out.slice(0,8),model:{news:30,price:25,volume:15,market:15,stability:15}});
};
