import * as XLSX from 'xlsx';
import {eq} from 'drizzle-orm';
import type {Engine} from './engine.js';
import {sessionEvents} from './schema.js';
export function results(engine:Engine,id:string,format:'csv'|'xlsx'){
 const g=engine.get(id),rankings=engine.rankings(id),answers=engine.store.answers(id);
 const safe=(v:unknown):string|number=>{if(typeof v==='number')return v;const s=String(v??'');return /^[=+\-@\t\r]/.test(s)?`'${s}`:s;};
 const readable=(qid:string,v:unknown)=>{const q=g.quiz.rounds.flatMap(r=>r.questions).find(q=>q.id===qid);return (Array.isArray(v)?v:[v]).map(x=>q?.options.find(o=>o.id===x)?.text??x).join(' | ');};
 const sheets:Record<string,Record<string,unknown>[]>={
 'Итоги':rankings.map(p=>({'Место':p.rank,'Никнейм':p.nickname,'Очки':p.score,'Время правильных ответов, с':p.correctTime/1000})),
 'Ответы':answers.map(a=>({'Участник':engine.store.players(id).find(p=>p.id===a.participantId)?.nickname,'Раунд':g.quiz.rounds.find(r=>r.id===a.roundId)?.title,'Вопрос':g.quiz.rounds.flatMap(r=>r.questions).find(q=>q.id===a.questionId)?.text,'Ответ':readable(a.questionId,a.value),'Верно':a.correct?'Да':'Нет','Очки':a.points,'Время, с':a.elapsedMs/1000,'Дата':new Date(a.createdAt).toISOString()})),
 'Вопросы':g.quiz.rounds.flatMap(r=>r.questions.map(q=>({'Раунд':r.title,'Вопрос':q.text,'Тип':q.type,'Правильный ответ':q.type==='number'?`${q.numericAnswer} ± ${q.tolerance}`:readable(q.id,q.correct),'Пояснение':q.explanation}))),
 'Раунды':g.quiz.rounds.flatMap(r=>rankings.map(p=>({'Раунд':r.title,'Участник':p.nickname,'Очки':answers.filter(a=>a.roundId===r.id&&a.participantId===p.id).reduce((s,a)=>s+a.points,0)}))),
 'События':engine.store.db.select().from(sessionEvents).where(eq(sessionEvents.sessionId,id)).all().map(e=>({'Дата':new Date(e.createdAt).toISOString(),'Событие':e.kind,'Данные':e.detail}))};
 const workbook=XLSX.utils.book_new();for(const [name,rows] of Object.entries(sheets)){const sheet=XLSX.utils.json_to_sheet(rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,safe(v)]))));sheet['!cols']=Object.keys(rows[0]??{}).map(()=>({wch:28}));XLSX.utils.book_append_sheet(workbook,sheet,name);}
 if(format==='csv'){// A single UTF-8 CSV contains detailed answers plus final place and total.
  const rows=answers.map(a=>{const p=rankings.find(p=>p.id===a.participantId);return {'Место':p?.rank??'Удалён','Никнейм':engine.store.players(id).find(p=>p.id===a.participantId)?.nickname,'Всего очков':p?.score??0,'Раунд':g.quiz.rounds.find(r=>r.id===a.roundId)?.title,'Вопрос':g.quiz.rounds.flatMap(r=>r.questions).find(q=>q.id===a.questionId)?.text,'Ответ':readable(a.questionId,a.value),'Очки за ответ':a.points,'Время ответа, с':a.elapsedMs/1000};});
  const data=rows.length?rows:sheets['Итоги'];return Buffer.from('\uFEFF'+XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(data.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,safe(v)])))),{FS:';'}),'utf8');}
 return XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}) as Buffer;
}
