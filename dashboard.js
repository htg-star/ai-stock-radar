const STOCKS=[
 ['삼성전자','005930.KS','KR','반도체'],['SK하이닉스','000660.KS','KR','반도체'],['현대차','005380.KS','KR','자동차'],['NAVER','035420.KS','KR','인터넷'],['카카오','035720.KS','KR','인터넷'],['한화에어로스페이스','012450.KS','KR','방산'],['HD현대중공업','329180.KS','KR','조선'],
 ['NVIDIA','NVDA','US','AI/반도체'],['Apple','AAPL','US','테크'],['Microsoft','MSFT','US','테크'],['Amazon','AMZN','US','테크'],['Alphabet','GOOGL','US','테크'],['Meta','META','US','테크'],['Tesla','TSLA','US','전기차'],['AMD','AMD','US','반도체'],['Broadcom','AVGO','US','반도체']
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function yahoo(symbol,range='5d',interval='1d'){
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range='+range+'&interval='+interval+'&includePrePost=false';
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}});
  if(!r.ok) throw new Error('Yahoo '+r.status);
  const j=await r.json(); const x=j.chart?.result?.[0]; if(!x) throw new Error('no chart');
  const q=x.indicators.quote[0], closes=q.close||[]; const last=closes.filter(v=>v!=null).at(-1), prev=closes.filter(v=>v!=null).at(-2)||last;
  return {price:last,change:last-prev,changePct:prev?((last-prev)/prev)*100:0,times:x.timestamp||[],closes};
}
async function newsFor(name){
  try{
    const u='https://news.google.com/rss/search?q='+encodeURIComponent('"'+name+'" when:2d')+'&hl=en-US&gl=US&ceid=US:en';
    const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}}); if(!r.ok)return 0;
    const x=await r.text(); return (x.match(/<item>/g)||[]).length;
  }catch{return 0;}
}
function score(m,n){
  const news=Math.min(100,50+n*5); const price=Math.max(0,Math.min(100,50+m.changePct*8));
  return Math.round(news*.30+price*.25+60*.15+65*.15+70*.15);
}
export default async function handler(req,res){
  try{
    const target=String(req.query?.symbol||'');
    if(target){
      const found=STOCKS.find(s=>s[1].toUpperCase()===target.toUpperCase())||[target,target,'US','검색'];
      let q={price:null,changePct:0,times:[],closes:[]}; try{q=await yahoo(found[1],'3mo','1d')}catch{}
      let n=0; try{n=await newsFor(found[0])}catch{}
      const ai=score(q,n);
      const expert=Math.round((q.changePct>0?55:45)+Math.min(25,n*2));
      res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
      return res.status(200).json({ok:true,stock:{name:found[0],symbol:found[1],market:found[2],sector:found[3]},quote:q,aiScore:ai,expertScore:expert,newsCount:n,updatedAt:new Date().toISOString()});
    }
    const rows=[];
    for(const s of STOCKS){
      let q={price:null,changePct:0}; try{q=await yahoo(s[1],'5d','1d')}catch{}
      let n=0; try{n=await newsFor(s[0])}catch{}
      rows.push({name:s[0],symbol:s[1],market:s[2],sector:s[3],price:q.price,changePct:q.changePct,aiScore:score(q,n),newsCount:n});
      await sleep(40);
    }
    rows.sort((a,b)=>b.aiScore-a.aiScore);
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=180');
    res.status(200).json({ok:true,updatedAt:new Date().toISOString(),market:{},topPicks:rows.slice(0,8),stocks:rows});
  }catch(e){res.status(200).json({ok:false,error:e.message,topPicks:[],stocks:[]});}
}
