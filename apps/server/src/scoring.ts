import type {AnswerValue,Question,Participant,Timer} from '../../../packages/shared/src/index.js';
export const normalize = (s:string)=>s.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim().replace(/\s+/g,' ');
export function isCorrect(q:Question,v:AnswerValue):boolean {
 if(q.type==='poll'||q.type==='info')return false;
 if(q.type==='number'){const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v.replace(',','.')):NaN;return Number.isFinite(n)&&Math.abs(n-q.numericAnswer)<=q.tolerance;}
 if(q.type==='text')return typeof v==='string'&&q.correct.some(a=>normalize(a)===normalize(v));
 const values=Array.isArray(v)?v:[String(v)];
 if(new Set(values).size!==values.length)return false;
 if(q.type==='order')return JSON.stringify(values)===JSON.stringify(q.correct);
 return values.length===q.correct.length&&values.every(a=>q.correct.includes(a));
}
export function score(q:Question,v:AnswerValue,elapsedMs:number){const correct=isCorrect(q,v);return {correct,points:correct?q.points+(q.speedBonus?Math.round(q.points*.5*Math.max(0,1-elapsedMs/(q.duration*1000))):0):0};}
export function rank<T extends Participant>(rows:T[]){return [...rows].sort((a,b)=>b.score-a.score||a.correctTime-b.correctTime||a.id.localeCompare(b.id)).map((p,i)=>({...p,rank:i+1,delta:p.previousRank===null?null:p.previousRank-(i+1)}));}
export function startTimer(seconds:number,now:number):Timer{return {startedAt:now,endsAt:now+seconds*1000,remainingMs:seconds*1000,paused:false,elapsedMs:0,segmentStart:now};}
export function elapsed(t:Timer,now:number){return t.elapsedMs+(t.paused?0:Math.max(0,now-t.segmentStart));}
export function pauseTimer(t:Timer,now:number):Timer{return t.paused?t:{...t,paused:true,remainingMs:Math.max(0,(t.endsAt??now)-now),endsAt:null,elapsedMs:elapsed(t,now)};}
export function resumeTimer(t:Timer,now:number):Timer{return !t.paused?t:{...t,paused:false,endsAt:now+t.remainingMs,segmentStart:now};}
export function accepts(t:Timer|null,now:number){return !!t&&!t.paused&&t.endsAt!==null&&now<t.endsAt;}
