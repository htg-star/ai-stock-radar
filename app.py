import os, json, math
from datetime import datetime, timezone
from pathlib import Path
import feedparser
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parents[1] / '.env')
app = FastAPI(title='AI Stock Radar API')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
DATA = Path(__file__).parents[1] / 'data' / 'state.json'

FEEDS = [
 ('Reuters Business','https://feeds.reuters.com/reuters/businessNews'),
 ('Google Finance KR','https://news.google.com/rss/search?q=%EC%A3%BC%EC%8B%9D%20%EA%B2%BD%EC%A0%9C&hl=ko&gl=KR&ceid=KR:ko'),
 ('Google Finance US','https://news.google.com/rss/search?q=stocks%20finance&hl=en-US&gl=US&ceid=US:en'),
]
DEMO = [
 {'title':'AI 반도체 수요 확대와 관련주 모멘텀 점검','source':'Demo Finance','url':'#','published':'방금 전','tickers':['SK하이닉스','삼성전자','한미반도체'],'impact':'positive'},
 {'title':'금리 경로와 성장주 밸류에이션 재평가','source':'Demo Macro','url':'#','published':'10분 전','tickers':['삼성전자','NAVER','NVIDIA'],'impact':'mixed'},
 {'title':'국제유가 상승이 운송·화학 업종에 미치는 영향','source':'Demo Market','url':'#','published':'28분 전','tickers':['대한항공','S-Oil'],'impact':'negative'},
]

def load_state():
    if DATA.exists(): return json.loads(DATA.read_text())
    return {'updated_at':None,'news':DEMO,'stocks':[]}

def score_news(news):
    # MVP deterministic score. Production version should add market price, filings, flow and LLM extraction.
    scores = {}
    for n in news:
        for t in n.get('tickers',[]):
            s = 70 if n.get('impact')=='positive' else 50 if n.get('impact')=='mixed' else 35
            scores[t] = max(scores.get(t,0), s)
    rows=[]
    for t,s in scores.items():
        rows.append({'ticker':t,'score':s,'news':s>=70,'reason': '최근 뉴스 모멘텀과 산업 연관성이 높음' if s>=70 else '거시 변수와 뉴스 방향이 혼재'})
    return sorted(rows,key=lambda x:x['score'],reverse=True)[:10]

def fetch_news():
    items=[]
    for source,url in FEEDS:
        try:
            feed=feedparser.parse(url)
            for e in feed.entries[:12]:
                title=e.get('title','').strip()
                if title:
                    items.append({'title':title,'source':source,'url':e.get('link','#'),'published':e.get('published',''),'tickers':[],'impact':'mixed'})
        except Exception:
            pass
    return items[:30]

@app.get('/api/health')
def health(): return {'ok':True,'time':datetime.now(timezone.utc).isoformat()}

@app.get('/api/dashboard')
def dashboard():
    return load_state()

@app.post('/api/refresh')
def refresh():
    news=fetch_news()
    # Keep demo fallback when external feeds are unavailable.
    if not news: news=DEMO
    # Lightweight keyword entity linking for MVP.
    mapping={
      'SK하이닉스':['하이닉스','HBM','SK hynix'], '삼성전자':['삼성전자','Samsung'],
      '한미반도체':['한미반도체'], 'NAVER':['네이버','NAVER'], 'NVIDIA':['NVIDIA','엔비디아'],
      '대한항공':['대한항공'], 'S-Oil':['S-Oil','에쓰오일']}
    for n in news:
        text=n['title']
        n['tickers']=[t for t,words in mapping.items() if any(w.lower() in text.lower() for w in words)]
        if not n['tickers']: n['tickers']=[]
    # If real RSS has no mapped tickers, retain demo signal cards as a useful baseline.
    allnews=news + [x for x in DEMO if x['title'] not in [n['title'] for n in news]]
    state={'updated_at':datetime.now(timezone.utc).isoformat(),'news':allnews[:35],'stocks':score_news(allnews)}
    DATA.write_text(json.dumps(state,ensure_ascii=False,indent=2))
    return state
