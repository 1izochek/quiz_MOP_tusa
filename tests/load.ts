import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {io,type Socket} from 'socket.io-client';
import {createApp} from '../apps/server/src/app.js';
import {newQuiz,newQuestion} from '../packages/shared/src/index.js';
const count=Number(process.env.LOAD_CLIENTS??200),questionCount=Number(process.env.LOAD_QUESTIONS??50);
const dir=mkdtempSync(join(tmpdir(),'party-load-')),server=createApp({dataDir:dir,password:'load-test-only-password',port:0,maxPlayers:Math.max(200,count),baseUrl:'http://localhost'}),sockets:Socket[]=[];
const latency:number[]=[];let rejected=0,accepted=0,peakConnections=0;
const ack=(s:Socket,event:string,data:any)=>new Promise<any>((resolve,reject)=>s.timeout(10000).emit(event,data,(err:any,r:any)=>err?reject(err):resolve(r)));
try{
 const port=await server.listen(0),url=`http://127.0.0.1:${port}`,quiz=newQuiz();quiz.title='Нагрузочная репетиция';quiz.rounds[0].questions=Array.from({length:questionCount},()=>({...newQuestion(),duration:5}));const game=await server.engine.create(quiz);
 for(let i=0;i<count;i++){const s=io(url,{transports:['websocket'],forceNew:true});sockets.push(s);await new Promise<void>((res,rej)=>{s.once('connect',res);s.once('connect_error',rej);});const r=await ack(s,'session:join',{code:game.code,nickname:`Гость ${String(i+1).padStart(3,'0')}`});if(!r.ok)throw Error(r.error);}
 peakConnections=server.io.engine.clientsCount;for(let i=0;i<2;i++)server.engine.action({sessionId:game.id,action:'next'});
 const start=performance.now();for(let question=0;question<questionCount;question++){
  // The first burst runs against a real five-second deadline. The remaining
  // 49 bursts move the server deadline to the final two seconds to stress the
  // same acceptance path without a four-minute idle wait.
  if(question===0)await new Promise(r=>setTimeout(r,3200));else{const g=server.engine.get(game.id);g.timer!.endsAt=Date.now()+1800;g.timer!.segmentStart=Date.now()-3200;}
  const q=quiz.rounds[0].questions[question];await Promise.all(sockets.map(async s=>{const t=performance.now();const r=await ack(s,'answer:submit',{questionId:q.id,value:q.correct});latency.push(performance.now()-t);if(r.ok)accepted++;else rejected++;}));
  server.engine.action({sessionId:game.id,action:'lock'});server.engine.action({sessionId:game.id,action:'reveal'});server.engine.action({sessionId:game.id,action:'next'});if(question%10===0)console.log(`Раунд нагрузки: ${question+1}/${questionCount}, принято ${accepted}, отклонено ${rejected}`);
 }
 const sorted=latency.sort((a,b)=>a-b),report={clients:count,peakConnections,questions:questionCount,answers:accepted,rejected,p50Ms:Math.round(sorted[Math.floor(sorted.length*.5)]),p95Ms:Math.round(sorted[Math.floor(sorted.length*.95)]),maxMs:Math.round(sorted.at(-1)!),durationSeconds:Math.round((performance.now()-start)/1000),storedAnswers:server.store.answers(game.id).length,phase:server.engine.get(game.id).phase};mkdirSync('work',{recursive:true});writeFileSync('work/load-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(rejected||accepted!==count*questionCount||report.phase!=='ROUND_LEADERBOARD')throw Error('Нагрузочная проверка не пройдена');
}finally{sockets.forEach(s=>s.disconnect());await server.close();rmSync(dir,{recursive:true,force:true});}
