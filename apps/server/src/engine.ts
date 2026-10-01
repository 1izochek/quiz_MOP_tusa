import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import type {Store} from './db.js';
import * as tables from './schema.js';
import {accepts,elapsed,pauseTimer,rank,resumeTimer,score,startTimer,normalize} from './scoring.js';
import {hasAnswerOptions} from '../../../packages/shared/src/index.js';
import type {Game,HostAction,Snapshot,AnswerValue,PublicQuestion,Quiz} from '../../../packages/shared/src/index.js';
export function currentQuestion(g:Game){return g.quiz.rounds[g.roundIndex]?.questions[g.questionIndex];}
export class Engine {
 games=new Map<string,Game>();online=new Map<string,string>();changed:(id:string)=>void=()=>{};countsChanged:(id:string)=>void=()=>{};
 constructor(public store:Store,public baseUrl:string,public maxPlayers=200,public blocklist:string[]=[]){for(const g of store.games()){if(g.phase==='QUESTION_OPEN'&&g.timer&&!g.timer.paused){g.timer=pauseTimer(g.timer,Math.min(Date.now(),g.timer.endsAt??Date.now()));g.revision++;store.saveGame(g);store.event(g.id,'server:recovered',{timerPaused:true});}if(g.phase==='QUESTION_MEDIA'){g.mediaStartedAt=null;store.saveGame(g);}this.games.set(g.id,g);}}
 get(id:string){const g=this.games.get(id);if(!g)throw Error('Игра не найдена');return g;}
 async create(q:Quiz){if(!q.rounds.length||q.rounds.some(r=>!r.questions.length))throw Error('Добавьте хотя бы один вопрос в каждый раунд');await this.store.backup();let code:string;do{code=String(randomInt(100000,1000000));}while([...this.games.values()].some(g=>g.code===code&&g.phase!=='FINISHED'));
  const now=Date.now();const g:Game={id:randomUUID(),code,quiz:structuredClone(q),phase:'LOBBY',roundIndex:0,questionIndex:0,timer:null,lobbyOpen:true,stats:false,fullLeaderboard:false,mediaMode:'intro',mediaStartedAt:null,revision:0,createdAt:now,updatedAt:now};this.games.set(g.id,g);this.store.saveGame(g);this.store.event(g.id,'session:created');return g;}
 persist(g:Game,kind:string,detail:unknown={}){g.revision++;g.updatedAt=Date.now();this.store.db.transaction(()=>{this.store.saveGame(g);this.store.event(g.id,kind,detail);});this.changed(g.id);}
 join(code:string,nickname:string){const g=[...this.games.values()].find(g=>g.code===code&&g.phase!=='FINISHED');if(!g)throw Error('Неверный код или игра уже закончилась');if(!g.lobbyOpen)throw Error('Ведущий закрыл вход в игру');const rows=this.store.players(g.id).filter(p=>!p.kicked);if(rows.length>=this.maxPlayers)throw Error('Все места заняты');if(rows.some(p=>normalize(p.nickname)===normalize(nickname)))throw Error('Этот никнейм уже занят');if(this.blocklist.some(word=>normalize(nickname).includes(normalize(word))))throw Error('Выберите другой никнейм');const token=randomBytes(32).toString('hex');const p={id:randomUUID(),sessionId:g.id,token,nickname,score:0,correctTime:0,kicked:false,previousRank:null,createdAt:Date.now()};this.store.db.insert(tables.participants).values(p).run();this.store.event(g.id,'participant:joined',{id:p.id,nickname});return p;}
 resume(token:string){const p=this.store.db.select().from(tables.participants).where(eq(tables.participants.token,token)).get();if(!p)throw Error('Не удалось восстановить участника');if(p.kicked)throw Error('Ведущий удалил вас из игры');this.get(p.sessionId);return p;}
 rankings(id:string){return rank(this.store.players(id).filter(p=>!p.kicked).map(({token:_token,createdAt:_createdAt,...p})=>({...p,online:this.online.has(p.id)})));}
 submit(sessionId:string,participantId:string,questionId:string,value:AnswerValue,now=Date.now()){
  const g=this.get(sessionId),q=currentQuestion(g);if(g.phase!=='QUESTION_OPEN'||!q||q.id!==questionId||q.type==='info'||!accepts(g.timer,now))throw Error('Приём ответов закрыт');
  const p=this.store.db.select().from(tables.participants).where(and(eq(tables.participants.id,participantId),eq(tables.participants.sessionId,sessionId))).get();if(!p||p.kicked)throw Error('Участник не найден');
  if(this.store.db.select({id:tables.answers.id}).from(tables.answers).where(and(eq(tables.answers.sessionId,sessionId),eq(tables.answers.participantId,participantId),eq(tables.answers.questionId,questionId))).get())throw Error('Ответ уже принят');
  if(['single','multiple','order','poll','video','prediction'].includes(q.type)){const v=Array.isArray(value)?value:[String(value)];if(!v.length||v.some(x=>!q.options.some(o=>o.id===x))||new Set(v).size!==v.length||(['single','poll','video','prediction'].includes(q.type)&&v.length!==1)||(q.type==='order'&&v.length!==q.options.length))throw Error('Проверьте варианты ответа');}
  if(q.type==='text'&&(typeof value!=='string'||!value.trim()))throw Error('Введите ответ');
  if(q.type==='number'&&!(typeof value==='number'||typeof value==='string'&&value.trim()&&Number.isFinite(Number(value.replace(',','.')))))throw Error('Введите число');
  const ms=elapsed(g.timer!,now),result=score(q,value,ms);
  this.store.db.insert(tables.answers).values({id:randomUUID(),sessionId,participantId,questionId,roundId:g.quiz.rounds[g.roundIndex].id,value:JSON.stringify(value),elapsedMs:ms,...result,createdAt:now}).run();this.countsChanged(sessionId);
 }
 award(g:Game){const q=currentQuestion(g);if(!q)return;const events=this.store.db.select().from(tables.scoreEvents).where(eq(tables.scoreEvents.sessionId,g.id)).all();this.store.db.transaction(tx=>{for(const a of this.store.answers(g.id).filter(a=>a.questionId===q.id)){if(events.some(e=>e.questionId===a.questionId&&e.participantId===a.participantId))continue;const p=tx.select().from(tables.participants).where(eq(tables.participants.id,a.participantId)).get()!;tx.update(tables.participants).set({score:p.score+a.points,correctTime:p.correctTime+(a.correct?a.elapsedMs:0)}).where(eq(tables.participants.id,p.id)).run();tx.insert(tables.scoreEvents).values({id:randomUUID(),sessionId:g.id,participantId:p.id,questionId:q.id,points:a.points,createdAt:Date.now()}).run();}});}
 open(g:Game,now:number){g.phase='QUESTION_OPEN';const q=currentQuestion(g)!;g.timer=q.type==='info'?null:startTimer(q.duration,now);g.stats=false;}
 prepare(g:Game,now:number){g.mediaMode='intro';g.mediaStartedAt=null;g.timer=null;g.stats=false;if(currentQuestion(g)?.video)g.phase='QUESTION_MEDIA';else this.open(g,now);}
 action(data:HostAction,now=Date.now()){
  const g=this.get(data.sessionId),q=currentQuestion(g);if(g.phase==='FINISHED')throw Error('Игра завершена');
  if(data.expectedRevision!==undefined&&data.expectedRevision!==g.revision)throw Error('Экран уже изменился. Повторите действие после обновления состояния.');
  const requirePhase=(...allowed:Game['phase'][])=>{if(!allowed.includes(g.phase))throw Error('Действие недоступно на этом экране');};
  switch(data.action){
   case 'next': switch(g.phase){case 'LOBBY':g.phase='QUIZ_INTRO';break;case 'QUIZ_INTRO':g.phase='ROUND_INTRO';break;case 'ROUND_INTRO':case 'BREAK':this.prepare(g,now);break;case 'QUESTION_MEDIA':if(g.mediaMode==='continue'){this.award(g);g.phase='ANSWER_REVEAL';}else if(q?.type==='prediction'){if(g.mediaStartedAt===null)g.mediaStartedAt=now;else throw Error('Дождитесь точки остановки видео');}else this.open(g,now);break;case 'QUESTION_OPEN':g.phase=q?.type==='info'?'ANSWER_REVEAL':'QUESTION_LOCKED';g.stats=true;g.timer=g.timer?pauseTimer(g.timer,now):null;break;case 'QUESTION_LOCKED':this.award(g);g.phase='ANSWER_REVEAL';break;case 'ANSWER_REVEAL':if(g.questionIndex+1<g.quiz.rounds[g.roundIndex].questions.length){g.questionIndex++;this.prepare(g,now);}else{g.phase='ROUND_LEADERBOARD';g.timer=null;}break;case 'ROUND_LEADERBOARD':if(g.roundIndex+1<g.quiz.rounds.length){for(const p of this.rankings(g.id))this.store.db.update(tables.participants).set({previousRank:p.rank}).where(eq(tables.participants.id,p.id)).run();g.roundIndex++;g.questionIndex=0;g.phase='ROUND_INTRO';}else{g.phase='FINISHED';g.lobbyOpen=false;}break;}break;
   case 'pause':requirePhase('QUESTION_OPEN');if(!g.timer||!accepts(g.timer,now))throw Error('Таймер уже остановлен');g.timer=pauseTimer(g.timer,now);break;
   case 'resume':requirePhase('QUESTION_OPEN');if(!g.timer?.paused)throw Error('Таймер не на паузе');g.timer=resumeTimer(g.timer,now);break;
   case 'lock':requirePhase('QUESTION_OPEN');g.phase='QUESTION_LOCKED';g.stats=true;g.timer=g.timer?pauseTimer(g.timer,now):null;break;
   case 'reveal':requirePhase('QUESTION_LOCKED');this.award(g);g.phase='ANSWER_REVEAL';break;
   case 'stats':requirePhase('QUESTION_LOCKED','ANSWER_REVEAL');g.stats=!g.stats;break;
   case 'continueVideo':requirePhase('QUESTION_LOCKED');if(q?.type!=='prediction'||!q.video)throw Error('Продолжение недоступно');g.phase='QUESTION_MEDIA';g.mediaMode='continue';g.mediaStartedAt=now;break;
   case 'mediaReady':requirePhase('QUESTION_MEDIA');if(g.mediaStartedAt===null)g.mediaStartedAt=now;break;
   case 'leaderboard':requirePhase('ANSWER_REVEAL','ROUND_LEADERBOARD');if(g.questionIndex!==g.quiz.rounds[g.roundIndex].questions.length-1)throw Error('Лидерборд доступен в конце раунда');g.phase='ROUND_LEADERBOARD';g.timer=null;break;
   case 'fullLeaderboard':requirePhase('ROUND_LEADERBOARD');g.fullLeaderboard=!g.fullLeaderboard;break;
   case 'break':requirePhase('ROUND_INTRO');g.phase='BREAK';break;
   case 'finish':this.award(g);g.phase='FINISHED';g.lobbyOpen=false;g.timer=null;break;
   case 'toggleLobby':g.lobbyOpen=!g.lobbyOpen;break;
   case 'kick':if(!data.participantId)throw Error('Выберите участника');this.store.db.update(tables.participants).set({kicked:true}).where(and(eq(tables.participants.id,data.participantId),eq(tables.participants.sessionId,g.id))).run();this.online.delete(data.participantId);break;
  }
  this.persist(g,`host:${data.action}`,data.participantId?{participantId:data.participantId}:{});
 }
 tick(now=Date.now()){for(const g of this.games.values()){if(g.phase==='QUESTION_OPEN'&&g.timer&&!g.timer.paused&&g.timer.endsAt!==null&&now>=g.timer.endsAt){g.timer=pauseTimer(g.timer,g.timer.endsAt);g.phase='QUESTION_LOCKED';g.stats=true;this.persist(g,'timer:expired');}else if(g.phase==='QUESTION_MEDIA'&&g.mediaMode==='intro'&&g.mediaStartedAt!==null&&currentQuestion(g)?.type==='prediction'&&now>=g.mediaStartedAt+currentQuestion(g)!.pauseAtSeconds*1000){this.open(g,now);this.persist(g,'video:paused');}}}
 counts(id:string){const g=this.get(id),players=this.store.players(id).filter(p=>!p.kicked),qid=currentQuestion(g)?.id;return {connected:players.filter(p=>this.online.has(p.id)).length,participantCount:players.length,answerCount:qid?this.store.questionAnswers(id,qid).filter(a=>players.some(p=>p.id===a.participantId)).length:0};}
 snapshot(id:string,role:'host'|'screen'|'player',participantId?:string):Snapshot{
  const g=this.get(id),q=['QUESTION_MEDIA','QUESTION_OPEN','QUESTION_LOCKED','ANSWER_REVEAL'].includes(g.phase)?currentQuestion(g):undefined;
  let question:PublicQuestion|null=null;if(q){const {correct,numericAnswer,tolerance,explanation,...safe}=q;question={...safe,options:hasAnswerOptions(q.type)?safe.options:[],...(q.type==='info'?{explanation}:{}),...(g.phase==='ANSWER_REVEAL'&&q.showAnswer?{correct,numericAnswer,tolerance,explanation}:{})};if(role==='player')question.video='';}
  const rankings=this.rankings(id),my=rankings.find(p=>p.id===participantId),answers=q?this.store.questionAnswers(id,q.id):[],mine=answers.find(a=>a.participantId===participantId),revealed=g.phase==='ANSWER_REVEAL';
  const stats:Record<string,number>={};if(q&&q.showStats&&g.stats){if(hasAnswerOptions(q.type))for(const o of q.options)stats[o.id]=0;for(const a of answers.filter(a=>rankings.some(p=>p.id===a.participantId))){for(const v of Array.isArray(a.value)?a.value:[String(a.value)])stats[v]=(stats[v]??0)+1;}}
  return {id:g.id,code:g.code,title:g.quiz.title,description:g.quiz.description,cover:g.quiz.cover,theme:g.quiz.theme,phase:g.phase,roundIndex:g.roundIndex,roundTitle:g.quiz.rounds[g.roundIndex].title,roundCount:g.quiz.rounds.length,questionIndex:g.questionIndex,questionCount:g.quiz.rounds[g.roundIndex].questions.length,question,timer:g.timer,lobbyOpen:g.lobbyOpen,...this.counts(id),serverNow:Date.now(),revision:g.revision,leaderboard:['ROUND_LEADERBOARD','FINISHED'].includes(g.phase)?rankings.slice(0,g.fullLeaderboard||g.phase==='FINISHED'?undefined:10):[],...(role==='host'?{roster:rankings}:{}),...(my?{me:my}:{}),...(mine?{myAnswer:{value:mine.value,...(revealed?{correct:mine.correct,points:mine.points}:{})}}:{}),stats:Object.keys(stats).length?stats:null,fullLeaderboard:g.fullLeaderboard,mediaMode:g.mediaMode,mediaStartedAt:g.mediaStartedAt,joinUrl:`${this.baseUrl}/play?code=${g.code}`};
 }
}
