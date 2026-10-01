import {describe,it,expect} from 'vitest';
import {newQuestion,newQuiz,type Game} from '../packages/shared/src/index.js';
import {normalize,score,isCorrect,rank,startTimer,pauseTimer,resumeTimer,accepts,elapsed} from '../apps/server/src/scoring.js';
import {nextPhase} from '../apps/server/src/engine.js';
describe('Ответы и очки',()=>{
 it('нормализует регистр, ё и пробелы',()=>expect(normalize('  ЁЖИК  В ТУМАНЕ ')).toBe('ежик в тумане'));
 it('проверяет один вариант и отклоняет дубликаты',()=>{const q=newQuestion();expect(isCorrect(q,[q.correct[0]])).toBe(true);expect(isCorrect(q,[q.correct[0],q.correct[0]])).toBe(false);expect(isCorrect(q,[q.options[1].id])).toBe(false);});
 it('множественный выбор: всё или ничего',()=>{const q={...newQuestion(),type:'multiple' as const,correct:['a','b']};expect(isCorrect(q,['b','a'])).toBe(true);expect(isCorrect(q,['a'])).toBe(false);expect(isCorrect(q,['a','b','c'])).toBe(false);});
 it('поддерживает альтернативы текстового ответа',()=>{const q={...newQuestion(),type:'text' as const,correct:['Ёж','Ежик']};expect(isCorrect(q,' ЕЖИК ')).toBe(true);expect(isCorrect(q,'кот')).toBe(false);});
 it('проверяет число и границы погрешности',()=>{const q={...newQuestion(),type:'number' as const,numericAnswer:2,tolerance:.5};expect(isCorrect(q,'2,5')).toBe(true);expect(isCorrect(q,1.5)).toBe(true);expect(isCorrect(q,2.51)).toBe(false);expect(isCorrect(q,'')).toBe(false);});
 it('порядок влияет на ответ',()=>{const q={...newQuestion(),type:'order' as const,correct:['a','b']};expect(isCorrect(q,['a','b'])).toBe(true);expect(isCorrect(q,['b','a'])).toBe(false);});
 it('скоростной бонус линейно уменьшается и ограничен',()=>{const q=newQuestion();expect(score(q,q.correct,0).points).toBe(1500);expect(score(q,q.correct,15000).points).toBe(1250);expect(score(q,q.correct,30000).points).toBe(1000);expect(score(q,q.correct,99000).points).toBe(1000);expect(score({...q,speedBonus:false},q.correct,0).points).toBe(1000);});
 it('опросы и информация не дают очков',()=>{const q=newQuestion();expect(score({...q,type:'poll'},q.correct,0).points).toBe(0);expect(score({...q,type:'info'},q.correct,0).points).toBe(0);});
});
describe('Серверный таймер',()=>{
 it('не принимает ответы на дедлайне и после',()=>{const t=startTimer(5,1000);expect(accepts(t,5999)).toBe(true);expect(accepts(t,6000)).toBe(false);expect(accepts(t,7000)).toBe(false);});
 it('пауза сохраняет остаток и исключается из скорости',()=>{const t=pauseTimer(startTimer(30,1000),11000);expect(t.remainingMs).toBe(20000);expect(accepts(t,12000)).toBe(false);const r=resumeTimer(t,21000);expect(r.endsAt).toBe(41000);expect(elapsed(r,22000)).toBe(11000);expect(pauseTimer(t,30000)).toEqual(t);expect(resumeTimer(r,31000)).toEqual(r);});
});
it('лидерборд: очки, время правильных ответов, стабильный ID',()=>{const base={sessionId:'g',nickname:'x',kicked:false,previousRank:3};const rows=rank([{...base,id:'c',score:1000,correctTime:600},{...base,id:'b',score:1000,correctTime:300},{...base,id:'a',score:1500,correctTime:900}]);expect(rows.map(x=>x.id)).toEqual(['a','b','c']);expect(rows[0].delta).toBe(2);});
it('переходы охватывают полный раунд и финал',()=>{const g:Game={id:'g',code:'123456',quiz:newQuiz(),phase:'LOBBY',roundIndex:0,questionIndex:0,timer:null,lobbyOpen:true,stats:false,fullLeaderboard:false,mediaMode:'intro',mediaStartedAt:null,revision:0,createdAt:0,updatedAt:0};for(const phase of ['ROUND_INTRO','QUESTION_OPEN','QUESTION_LOCKED','ANSWER_REVEAL','ROUND_LEADERBOARD','FINISHED'] as const){expect(nextPhase(g)).toBe(phase);g.phase=phase;}expect(nextPhase(g)).toBe('FINISHED');});
