import Database from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {and,eq} from 'drizzle-orm';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import * as tables from './schema.js';
import type {Quiz,Game,Answer} from '../../../packages/shared/src/index.js';
export function openStore(dir:string){
 mkdirSync(resolve(dir,'uploads'),{recursive:true});mkdirSync(resolve(dir,'backups'),{recursive:true});
 const sqlite=new Database(resolve(dir,'party.sqlite'));sqlite.pragma('journal_mode = WAL');sqlite.pragma('foreign_keys = ON');sqlite.pragma('busy_timeout = 5000');
 sqlite.exec(`CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,title TEXT NOT NULL,document TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,quizId TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,title TEXT NOT NULL,sortOrder INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,roundId TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,document TEXT NOT NULL,sortOrder INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS answer_options(id TEXT PRIMARY KEY,questionId TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,text TEXT NOT NULL,sortOrder INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS media_files(id TEXT PRIMARY KEY,path TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS game_sessions(id TEXT PRIMARY KEY,code TEXT NOT NULL,document TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,sessionId TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,token TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL,score INTEGER NOT NULL DEFAULT 0,correctTime INTEGER NOT NULL DEFAULT 0,kicked INTEGER NOT NULL DEFAULT 0,previousRank INTEGER,createdAt INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS participant_session ON participants(sessionId);
 CREATE TABLE IF NOT EXISTS submitted_answers(id TEXT PRIMARY KEY,sessionId TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,participantId TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,questionId TEXT NOT NULL,roundId TEXT NOT NULL,value TEXT NOT NULL,elapsedMs INTEGER NOT NULL,correct INTEGER NOT NULL,points INTEGER NOT NULL,createdAt INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS one_answer ON submitted_answers(sessionId,participantId,questionId);
 CREATE INDEX IF NOT EXISTS answers_session ON submitted_answers(sessionId,questionId);
 CREATE TABLE IF NOT EXISTS score_events(id TEXT PRIMARY KEY,sessionId TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,participantId TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,questionId TEXT NOT NULL,points INTEGER NOT NULL,createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS session_events(id TEXT PRIMARY KEY,sessionId TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,kind TEXT NOT NULL,detail TEXT NOT NULL,createdAt INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS events_session ON session_events(sessionId);
 PRAGMA user_version=1;`);
 const db=drizzle(sqlite,{schema:tables});
 return {db,sqlite,dir,
  quizzes:()=>db.select().from(tables.quizzes).all().map(x=>JSON.parse(x.document) as Quiz),
  quiz:(id:string)=>{const row=db.select().from(tables.quizzes).where(eq(tables.quizzes.id,id)).get();return row?JSON.parse(row.document) as Quiz:undefined;},
  saveQuiz:(q:Quiz)=>{db.transaction(tx=>{const now=Date.now();tx.insert(tables.quizzes).values({id:q.id,title:q.title,document:JSON.stringify(q),createdAt:now,updatedAt:now}).onConflictDoUpdate({target:tables.quizzes.id,set:{title:q.title,document:JSON.stringify(q),updatedAt:now}}).run();tx.delete(tables.rounds).where(eq(tables.rounds.quizId,q.id)).run();q.rounds.forEach((r,ri)=>{tx.insert(tables.rounds).values({id:r.id,quizId:q.id,title:r.title,sortOrder:ri}).run();r.questions.forEach((question,qi)=>{tx.insert(tables.questions).values({id:question.id,roundId:r.id,document:JSON.stringify(question),sortOrder:qi}).run();question.options.forEach((o,oi)=>tx.insert(tables.answerOptions).values({...o,questionId:question.id,sortOrder:oi}).run());});});});},
  saveGame:(g:Game)=>db.insert(tables.sessions).values({id:g.id,code:g.code,document:JSON.stringify(g),createdAt:g.createdAt,updatedAt:g.updatedAt}).onConflictDoUpdate({target:tables.sessions.id,set:{document:JSON.stringify(g),updatedAt:g.updatedAt}}).run(),
  games:()=>db.select().from(tables.sessions).all().map(x=>JSON.parse(x.document) as Game),
  players:(sessionId:string)=>db.select().from(tables.participants).where(eq(tables.participants.sessionId,sessionId)).all(),
  answers:(sessionId:string)=>db.select().from(tables.answers).where(eq(tables.answers.sessionId,sessionId)).all().map(a=>({...a,value:JSON.parse(a.value) as Answer['value']})),
  questionAnswers:(sessionId:string,questionId:string)=>db.select().from(tables.answers).where(and(eq(tables.answers.sessionId,sessionId),eq(tables.answers.questionId,questionId))).all().map(a=>({...a,value:JSON.parse(a.value) as Answer['value']})),
  event:(sessionId:string,kind:string,detail:unknown={})=>db.insert(tables.sessionEvents).values({id:randomUUID(),sessionId,kind,detail:JSON.stringify(detail),createdAt:Date.now()}).run(),
  backup:()=>sqlite.backup(resolve(dir,'backups',`party-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`))
 };
}
export type Store=ReturnType<typeof openStore>;
