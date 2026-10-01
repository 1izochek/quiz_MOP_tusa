import {afterEach,describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newQuiz,quizSchema} from '../packages/shared/src/index.js';
import {openStore,type Store} from '../apps/server/src/db.js';
import {Engine} from '../apps/server/src/engine.js';
import {isCorrect} from '../apps/server/src/scoring.js';

const resources:{dir:string;store:Store}[]=[];
afterEach(()=>{for(const {dir,store} of resources.splice(0)){store.sqlite.close();rmSync(dir,{recursive:true,force:true});}});
function fixture(){const dir=mkdtempSync(join(tmpdir(),'projector-test-')),store=openStore(dir);resources.push({dir,store});return {store,engine:new Engine(store,'http://localhost:3000')};}

describe('Обложка и свободные ответы',()=>{
 it('сохраняет 100 формулировок, засчитывает сотую и отклоняет 101',()=>{
  const quiz=newQuiz(),q=quiz.rounds[0].questions[0];q.type='text';q.correct=Array.from({length:100},(_,i)=>`Ответ ${i+1}`);
  const {store}=fixture();store.saveQuiz(quizSchema.parse(quiz));
  const saved=store.quiz(quiz.id)!.rounds[0].questions[0];
  expect(saved.correct).toHaveLength(100);expect(isCorrect(saved,' ответ 100 ')).toBe(true);
  q.correct.push('Ответ 101');expect(quizSchema.safeParse(quiz).success).toBe(false);
 });
 it('показывает отдельную обложку перед заставкой раунда и сохраняет её состояние',async()=>{
  const {store,engine}=fixture(),quiz=newQuiz();quiz.cover='/uploads/cover.png';
  const game=await engine.create(quiz);engine.action({sessionId:game.id,action:'next'});
  const restored=new Engine(store,'http://localhost:3000');
  const screen=restored.snapshot(game.id,'screen');
  expect(screen.phase).toBe('QUIZ_INTRO');expect(screen.cover).toBe(quiz.cover);expect(screen.question).toBeNull();expect(screen.timer).toBeNull();
  restored.action({sessionId:game.id,action:'next'});expect(restored.get(game.id).phase).toBe('ROUND_INTRO');
  restored.action({sessionId:game.id,action:'next'});expect(restored.get(game.id).phase).toBe('QUESTION_OPEN');
 });
 it.each(['text','number','info'] as const)('не отправляет старые кнопки на экран %s-вопроса',async type=>{
  const {engine}=fixture(),quiz=newQuiz(),q=quiz.rounds[0].questions[0];q.type=type;q.correct=type==='text'?['Верно']:[];
  const game=await engine.create(quiz);
  for(let i=0;i<3;i++)engine.action({sessionId:game.id,action:'next'});
  for(const role of ['host','screen','player'] as const)expect(engine.snapshot(game.id,role).question?.options).toEqual([]);
  expect(q.options).toHaveLength(2); // Existing quizzes can retain hidden choice data without displaying it.
  if(type!=='info'){
   const player=engine.join(game.code,'Гость');engine.submit(game.id,player.id,q.id,type==='text'?'Верно':'0');
   engine.action({sessionId:game.id,action:'lock'});
   expect(engine.snapshot(game.id,'screen').stats).toEqual(type==='text'?{'Верно':1}:{'0':1});
  }
 });
});
