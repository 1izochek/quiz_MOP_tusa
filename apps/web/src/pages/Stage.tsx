import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Sparkles,Users,Check,Trophy,Volume2,Smartphone} from 'lucide-react';
import {hasAnswerOptions,type Snapshot,type PublicQuestion} from '../../../../packages/shared/src/index';
import {useCountdown,useUI} from '../lib';

/** Scale the complete slide only when its content exceeds the projector viewport. */
function Slide({screen,children}:{screen:boolean;children:ReactNode}) {
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const [scale,setScale]=useState(1);
 useLayoutEffect(()=>{
  if(!screen||!viewport.current||!content.current)return;
  const resize=()=>{
   const available=viewport.current!.clientHeight;
   const needed=content.current!.scrollHeight;
   if(available&&needed)setScale(Math.min(1,available/needed));
  };
  const observer=new ResizeObserver(resize);
  observer.observe(viewport.current);observer.observe(content.current);resize();
  return()=>observer.disconnect();
 },[screen]);
 return <div ref={viewport} className="stage-viewport"><div ref={content} className="stage-slide" style={screen?{transform:`translateY(-50%) scale(${scale})`}:undefined}>{children}</div></div>;
}

export function QuizStage({state:s,role,qr,connected}:{state:Snapshot;role:'host'|'screen';qr:string;connected:boolean}) {
 const screen=role==='screen';
 return <main className="stage projection-surface" data-theme={s.theme} data-phase={s.phase}>
  <header className="stage-header">
   <div className="brand"><span className="brand-icon"><Sparkles/></span>party<span>quiz</span></div>
   <span>{s.phase==='LOBBY'?'ПРИСОЕДИНЯЙТЕСЬ К ИГРЕ':s.phase==='QUIZ_INTRO'?'СЕГОДНЯ ИГРАЕМ ВМЕСТЕ':s.phase==='FINISHED'?'ФИНАЛ':`${s.roundTitle} · ${s.roundIndex+1}/${s.roundCount}`}</span>
   <div className="row"><Users size={22}/>{s.participantCount}</div>
  </header>
  <Slide screen={screen}>
   {s.phase==='LOBBY'?<div className="stage-lobby">
    <div><span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</span><h1>{s.title}</h1><p>{s.description}</p><div className="pill"><span className="status-dot"/>{s.participantCount} гостей уже в игре</div><p className="lobby-instruction">Откройте камеру телефона<br/>и отсканируйте QR-код.</p></div>
    <div className="qr-card">{qr&&<img src={qr} alt="QR-код для входа в игру"/>}<p>Код игры</p><strong className="game-code">{s.code}</strong><span>{s.joinUrl.split('/play')[0]}/play</span></div>
   </div>:s.phase==='QUIZ_INTRO'?<div className={`quiz-cover-slide ${s.cover?'has-cover':''}`}>
    <div className="cover-copy"><span className="eyebrow">ВАШ ВЕЧЕР НАЧИНАЕТСЯ</span><h1>{s.title}</h1>{s.description&&<p>{s.description}</p>}<div className="cover-meta"><span>{s.roundCount} {s.roundCount===1?'раунд':s.roundCount<5?'раунда':'раундов'}</span><span>Играем вместе</span></div></div>
    {s.cover&&<img className="quiz-cover-image" src={s.cover} alt="Обложка квиза"/>}
   </div>:s.phase==='ROUND_INTRO'||s.phase==='BREAK'?<div className="round-stage">
    <span className="round-quiz-title">{s.title}</span><span className="round-number">{s.phase==='BREAK'?'ПАУЗА':`РАУНД ${String(s.roundIndex+1).padStart(2,'0')}`}</span><h1>{s.phase==='BREAK'?'Скоро продолжим':s.roundTitle}</h1><p>{s.phase==='BREAK'?'Хороший момент для фото':`${s.questionCount} вопросов · Приготовьте телефоны`}</p>
   </div>:['ROUND_LEADERBOARD','FINISHED'].includes(s.phase)?<Leaderboard key={s.phase} state={s} screen={screen}/>:s.question?<QuestionSlide state={s} host={role==='host'}/>:null}
  </Slide>
  <footer className="stage-footer"><span>{s.phase==='LOBBY'?'МОБИЛЬНЫЙ ИНТЕРНЕТ ИЛИ WI-FI':s.title}</span><span>КОД ИГРЫ {s.code}</span></footer>
  {!connected&&<div className="reconnect-banner">Восстанавливаем соединение…</div>}
 </main>;
}

function QuestionSlide({state:s,host}:{state:Snapshot;host:boolean}) {
 const q=s.question!;
 const choices=hasAnswerOptions(q.type),free=q.type==='text'||q.type==='number';
 const showAnswers=s.phase!=='QUESTION_MEDIA'&&q.type!=='info';
 const media=Boolean(q.video||q.image);
 return <div className={`question-stage ${media?'has-media':''}`} data-question-type={q.type}>
  <div className="row between question-heading"><span className="eyebrow">{q.type==='info'?'МОМЕНТ ДЛЯ ВАС':`ВОПРОС ${s.questionIndex+1} ИЗ ${s.questionCount}`}</span><Timer state={s}/></div>
  <h1>{q.text}</h1>
  {q.type==='info'&&<p className="info-copy">{q.explanation}</p>}
  <div className="question-content">
   {media&&<div className="question-media">{q.video?<Video state={s} host={host}/>:<img className="stage-image" src={q.image} alt="Изображение к вопросу"/>}</div>}
   {showAnswers&&<div className="question-responses">
    {choices&&<div className="answer-grid">{q.options.map((o,i)=>{
     const correct=s.phase==='ANSWER_REVEAL'&&q.correct?.includes(o.id);
     return <div className={`answer-option color-${i%4} ${correct?'correct':''}`} key={o.id}><span className="option-letter">{'АБВГДЕЖЗ'[i]}</span><span className="grow">{o.text}</span>{correct&&<Check className="correct-mark" aria-label="Правильный вариант"/>}{s.stats&&<span className="stat-count">{s.stats[o.id]??0}</span>}{s.stats&&<div className="stat-bar" style={{width:`${Math.min(100,(s.stats[o.id]??0)/Math.max(1,s.answerCount)*100)}%`}}/>}</div>;
    })}</div>}
    {free&&s.phase==='QUESTION_OPEN'&&<div className="free-answer-prompt"><Smartphone/><span>{q.type==='number'?'Введите число на телефоне':'Введите ответ на телефоне'}<small>Затем нажмите «Это мой ответ»</small></span></div>}
    {s.phase==='ANSWER_REVEAL'&&<div className="reveal"><CorrectAnswer question={q}/>{q.explanation&&<p>{q.explanation}</p>}</div>}
    {free&&s.stats&&<div className="text-stats"><span className="stats-title">Ответы гостей</span>{Object.entries(s.stats).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([v,n])=><span className="pill" key={v}>{v} <strong>· {n}</strong></span>)}</div>}
   </div>}
  </div>
  {showAnswers&&<div className="answer-counter"><Check size={22}/>{s.answerCount} из {s.participantCount} ответили{s.phase==='QUESTION_LOCKED'&&' · Приём ответов закрыт'}</div>}
 </div>;
}

export function Timer({state}:{state:Snapshot}) {
 const seconds=useCountdown(state);
 return state.timer?<div className={`timer ${seconds<=5?'urgent':''}`}><span>{state.timer.paused?'Ⅱ':'◷'}</span>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</div>:null;
}
export function CorrectAnswer({question:q}:{question:PublicQuestion}) {
 if(!q.correct)return null;
 const answer=q.type==='number'?`${q.numericAnswer}${q.tolerance?` ± ${q.tolerance}`:''}`:q.type==='text'?q.correct.find(value=>value.trim()):q.correct.map(c=>q.options.find(o=>o.id===c)?.text??c).join(q.type==='order'?' → ':' · ');
 return answer?<div className="correct-line"><Check size={26}/><strong>{answer}</strong></div>:null;
}
export function Leaderboard({state:s,player=false,screen=false}:{state:Snapshot;player?:boolean;screen?:boolean}) {
 const final=s.phase==='FINISHED',pageSize=6;
 const pages=screen?Math.max(1,final&&s.leaderboard.length<=3?1:Math.ceil(s.leaderboard.length/pageSize)+(final?1:0)):1;
 const [page,setPage]=useState(0);
 const current=page%pages,showPodium=final&&(!screen||current===0);
 useEffect(()=>{if(pages<=1)return;const timer=setInterval(()=>setPage(p=>(p+1)%pages),10000);return()=>clearInterval(timer);},[pages]);
 const start=Math.max(0,current-(final?1:0))*pageSize;
 const list=player?s.leaderboard.slice(0,5):screen?s.leaderboard.slice(start,start+pageSize):s.leaderboard;
 return <div className="leaderboard">
  {final&&(!player||(s.me?.rank??1000)<=3)&&<div className="confetti" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{left:`${i*4.1}%`,animationDelay:`${i%7*.15}s`,background:['#6b46c1','#418327','#b53477'][i%3],transform:`rotate(${i*32}deg)`}}/>)}</div>}
  <span className="eyebrow">{final?'ВОТ ЭТО БЫЛ ВЕЧЕР':'ЛИДЕРБОРД РАУНДА'}</span><h1>{final?'Ваши аплодисменты!':'Кто впереди?'}</h1>
  {showPodium&&<div className="podium">{[1,0,2].map(i=>{const p=s.leaderboard[i];return p?<div className={`podium-place place-${i+1}`} key={p.id}><span className="podium-avatar">{i===0?<Trophy size={40}/>:p.nickname.slice(0,1).toUpperCase()}</span><strong>{p.nickname}</strong><span>{p.score} очков</span><div>{i+1}</div></div>:null;})}</div>}
  {(!screen||!showPodium)&&<div className="leaderboard-table"><div className="leaderboard-row table-head"><span>МЕСТО</span><span>УЧАСТНИК</span><span>ОЧКИ</span><span>Δ</span></div>{list.map(p=><div className={`leaderboard-row ${p.rank<=3?'top-three':''} ${p.id===s.me?.id?'is-me':''}`} key={p.id}><span>{p.rank<=3?['🥇','🥈','🥉'][p.rank-1]:p.rank}</span><strong>{p.nickname}{p.id===s.me?.id?' · вы':''}</strong><span>{p.score.toLocaleString('ru-RU')}</span><small className={p.delta&&p.delta>0?'accent':''}>{p.delta===null?'—':p.delta>0?'↑'+p.delta:p.delta<0?'↓'+Math.abs(p.delta):'·'}</small></div>)}</div>}
  {screen&&pages>1&&<p className="leaderboard-pagination">{showPodium?'Победители':`Места ${start+1}–${Math.min(start+pageSize,s.leaderboard.length)}`} · {current+1} / {pages}<span>Следующая страница — автоматически</span></p>}
 </div>;
}
function Video({state:s,host}:{state:Snapshot;host:boolean}){const ref=useRef<HTMLVideoElement>(null),[blocked,setBlocked]=useState(false);const q=s.question!;
 useEffect(()=>{const video=ref.current;if(!video)return;const sync=()=>{if(s.phase==='QUESTION_MEDIA'&&s.mediaStartedAt!==null){const time=(s.mediaMode==='continue'?q.pauseAtSeconds:0)+Math.max(0,s.serverNow-s.mediaStartedAt)/1000;if(Number.isFinite(video.duration)&&Math.abs(video.currentTime-time)>.8)video.currentTime=Math.min(video.duration,time);video.muted=host;void video.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true));}else{video.pause();if(q.type==='prediction'&&s.phase!=='QUESTION_MEDIA'&&s.phase!=='ANSWER_REVEAL')video.currentTime=q.pauseAtSeconds;}};sync();video.addEventListener('loadedmetadata',sync);return()=>video.removeEventListener('loadedmetadata',sync);},[s.phase,s.mediaMode,s.mediaStartedAt,s.serverNow,q.pauseAtSeconds,q.type,host]);
 return <div className="stage-video-wrap"><video ref={ref} className="stage-video" src={q.video} poster={q.poster} playsInline preload="auto" muted={host} onTimeUpdate={()=>{if(q.type==='prediction'&&s.mediaMode==='intro'&&ref.current&&ref.current.currentTime>=q.pauseAtSeconds){ref.current.pause();ref.current.currentTime=q.pauseAtSeconds;}}} onError={()=>useUI.getState().notify('Браузер не смог воспроизвести видео. Используйте MP4 H.264 или WebM.')}/>{blocked&&<button className="button video-activate" onClick={()=>{if(ref.current){ref.current.muted=host;void ref.current.play().then(()=>setBlocked(false)).catch(()=>useUI.getState().notify('Запуск видео заблокирован браузером'));}}}><Volume2 size={20}/>Разрешить воспроизведение на этом экране</button>}{s.phase==='QUESTION_MEDIA'&&!s.mediaStartedAt&&<div className="video-caption">Видео запустит ведущий</div>}</div>;
}
