import { z } from 'zod';
export const states = ['LOBBY','ROUND_INTRO','QUESTION_MEDIA','QUESTION_OPEN','QUESTION_LOCKED','ANSWER_REVEAL','ROUND_LEADERBOARD','BREAK','FINISHED'] as const;
export type Phase = typeof states[number];
export const types = ['single','multiple','text','number','order','poll','info','video','prediction'] as const;
export const typeLabels: Record<typeof types[number],string> = {single:'Один ответ',multiple:'Несколько ответов',text:'Текстовый ответ',number:'Числовой ответ',order:'Порядок',poll:'Опрос',info:'Информационная карточка',video:'Видео-вопрос',prediction:'Угадай продолжение'};
const id = z.string().min(1).max(80);
const media = z.string().regex(/^\/uploads\/[a-zA-Z0-9._-]+$/).or(z.literal('')).default('');
export const questionSchema = z.object({id,type:z.enum(types),text:z.string().min(1).max(2000),explanation:z.string().max(4000).default(''),options:z.array(z.object({id,text:z.string().min(1).max(300)})).max(8),correct:z.array(z.string().max(500)).max(20),numericAnswer:z.number().finite().default(0),tolerance:z.number().min(0).max(1e12).default(0),duration:z.number().int().min(5).max(180),points:z.number().int().min(0).max(10000),speedBonus:z.boolean(),showStats:z.boolean(),showAnswer:z.boolean(),image:media,video:media,poster:media,pauseAtSeconds:z.number().min(0.1).max(36000).default(5)});
export const quizSchema = z.object({id,title:z.string().trim().min(1).max(120),description:z.string().max(1000).default(''),theme:z.enum(['neon','disco','minimal','party']),cover:media,rounds:z.array(z.object({id,title:z.string().min(1).max(120),questions:z.array(questionSchema).max(200)})).max(50)}).superRefine((q,ctx)=>{
  const ids = new Set<string>();
  for(const r of q.rounds){for(const key of [r.id,...r.questions.map(x=>x.id)]){if(ids.has(key))ctx.addIssue({code:'custom',message:'Идентификаторы должны быть уникальны'});ids.add(key);}
    for(const question of r.questions){const opts=question.options.map(o=>o.id);if(new Set(opts).size!==opts.length)ctx.addIssue({code:'custom',message:'Повтор вариантов'});
      if(['single','multiple','order','poll','video','prediction'].includes(question.type)&&opts.length<2)ctx.addIssue({code:'custom',message:'Нужно от 2 до 8 вариантов'});
      if(['single','multiple','order','video','prediction'].includes(question.type)&&(!question.correct.length||question.correct.some(c=>!opts.includes(c))))ctx.addIssue({code:'custom',message:'Выберите правильный ответ'});
      if(['single','video','prediction'].includes(question.type)&&question.correct.length!==1)ctx.addIssue({code:'custom',message:'Нужен один правильный ответ'});
      if(question.type==='multiple'&&new Set(question.correct).size!==question.correct.length)ctx.addIssue({code:'custom',message:'Правильные варианты не должны повторяться'});
      if(question.type==='order'&&(question.correct.length!==opts.length||new Set(question.correct).size!==opts.length))ctx.addIssue({code:'custom',message:'Укажите полный порядок'});
      if(question.type==='text'&&!question.correct.some(c=>c.trim()))ctx.addIssue({code:'custom',message:'Укажите допустимый ответ'});
    }
  }
});
export type Question = z.infer<typeof questionSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export const nicknameSchema = z.string().transform(v=>v.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/g,' ').trim()).pipe(z.string().min(2,'Минимум 2 символа').max(24,'Максимум 24 символа'));
export const joinSchema = z.object({code:z.string().regex(/^\d{6}$/),nickname:nicknameSchema});
export const resumeSchema = z.object({token:z.string().regex(/^[a-f0-9]{64}$/)});
export const watchSchema = z.object({sessionId:id,role:z.enum(['host','screen'])});
export const answerValueSchema = z.union([z.string().max(500),z.number().finite(),z.array(z.string().max(80)).max(8)]);
export type AnswerValue = z.infer<typeof answerValueSchema>;
export const answerSchema = z.object({questionId:id,value:answerValueSchema});
export const actions = ['next','pause','resume','lock','reveal','stats','continueVideo','leaderboard','fullLeaderboard','break','finish','toggleLobby','kick','mediaReady'] as const;
export const actionSchema = z.object({sessionId:id,action:z.enum(actions),participantId:id.optional(),expectedRevision:z.number().int().nonnegative().optional()});
export type HostAction = z.infer<typeof actionSchema>;
export interface Timer { startedAt:number; endsAt:number|null; remainingMs:number; paused:boolean; elapsedMs:number; segmentStart:number }
export interface Participant {id:string;sessionId:string;nickname:string;score:number;correctTime:number;kicked:boolean;previousRank:number|null}
export interface Rank extends Participant {rank:number;delta:number|null;online:boolean}
export interface Answer {id:string;sessionId:string;participantId:string;questionId:string;roundId:string;value:AnswerValue;elapsedMs:number;correct:boolean;points:number;createdAt:number}
export interface Game {id:string;code:string;quiz:Quiz;phase:Phase;roundIndex:number;questionIndex:number;timer:Timer|null;lobbyOpen:boolean;stats:boolean;fullLeaderboard:boolean;mediaMode:'intro'|'continue';mediaStartedAt:number|null;revision:number;createdAt:number;updatedAt:number}
export type PublicQuestion = Omit<Question,'correct'|'numericAnswer'|'tolerance'|'explanation'> & Partial<Pick<Question,'correct'|'numericAnswer'|'tolerance'|'explanation'>>;
export interface Snapshot {id:string;code:string;title:string;description:string;cover:string;theme:Quiz['theme'];phase:Phase;roundIndex:number;roundTitle:string;roundCount:number;questionIndex:number;questionCount:number;question:PublicQuestion|null;timer:Timer|null;lobbyOpen:boolean;connected:number;participantCount:number;answerCount:number;serverNow:number;revision:number;leaderboard:Rank[];roster?:Rank[];me?:Rank;myAnswer?:{value:AnswerValue;correct?:boolean;points?:number};stats:Record<string,number>|null;fullLeaderboard:boolean;mediaMode:Game['mediaMode'];mediaStartedAt:number|null;joinUrl:string}
export type Reply<T=undefined> = {ok:true;data:T}|{ok:false;error:string};
export type Ack<T=undefined> = (reply:Reply<T>)=>void;
export interface ClientEvents {
 'session:join':(data:z.infer<typeof joinSchema>,ack:Ack<{token:string;sessionId:string}>)=>void;
 'session:resume':(data:z.infer<typeof resumeSchema>,ack:Ack<{sessionId:string}>)=>void;
 'session:watch':(data:z.infer<typeof watchSchema>,ack:Ack)=>void;
 'answer:submit':(data:z.infer<typeof answerSchema>,ack:Ack)=>void;
 'host:action':(data:HostAction,ack:Ack)=>void;
 'connection:ping':(ack:Ack<{serverNow:number}>)=>void;
}
export interface ServerEvents {'session:state':(state:Snapshot)=>void;'session:counts':(counts:{connected:number;participantCount:number;answerCount:number})=>void;'participant:kicked':(reason:string)=>void;'connection:replaced':()=>void;'connection:status':(message:string)=>void;}
export function newQuestion():Question { const a=crypto.randomUUID(),b=crypto.randomUUID();return {id:crypto.randomUUID(),type:'single',text:'Новый вопрос',explanation:'',options:[{id:a,text:'Первый вариант'},{id:b,text:'Второй вариант'}],correct:[a],numericAnswer:0,tolerance:0,duration:30,points:1000,speedBonus:true,showStats:true,showAnswer:true,image:'',video:'',poster:'',pauseAtSeconds:5}; }
export function newQuiz():Quiz{return {id:crypto.randomUUID(),title:'Новый квиз',description:'Вечер, который запомнится',theme:'neon',cover:'',rounds:[{id:crypto.randomUUID(),title:'Разминка',questions:[newQuestion()]}]};}
