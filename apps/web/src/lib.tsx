import {useEffect,useRef,useState} from 'react';
import {create} from 'zustand';
import {io,type Socket} from 'socket.io-client';
import * as Dialog from '@radix-ui/react-dialog';
import {X,AlertCircle,Sun,Moon} from 'lucide-react';
import type {ClientEvents,ServerEvents,Snapshot,HostAction,AnswerValue} from '../../../packages/shared/src/index';
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{const res=await fetch('/api'+path,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});const data=await res.json();if(!res.ok)throw Error(data.error??'Ошибка запроса');return data;}
export const useUI=create<{
 theme:string;setTheme:(v:string)=>void;mode:'dark'|'light';setMode:(v:'dark'|'light')=>void;
 saveBeforeLeave:(()=>Promise<void>)|null;notice:string;notify:(v:string)=>void;
}>(set=>({
 theme:localStorage.getItem('pq_theme')??'neon',
 setTheme:v=>{localStorage.setItem('pq_theme',v);set({theme:v});},
 mode:localStorage.getItem('pq_mode')==='light'?'light':'dark',
 setMode:v=>{localStorage.setItem('pq_mode',v);set({mode:v});},
 saveBeforeLeave:null,notice:'',notify:notice=>set({notice})
}));
export function ThemeRoot(){const {theme,mode}=useUI();useEffect(()=>{document.documentElement.dataset.mode=mode;document.documentElement.dataset.theme=theme;},[theme,mode]);return null;}
export function ThemeModeToggle(){const {mode,setMode}=useUI();const label=mode==='dark'?'Светлая тема':'Темная тема';return <button className="ghost theme-toggle" aria-label={label} title={label} onClick={()=>setMode(mode==='dark'?'light':'dark')}>{mode==='dark'?<Sun size={17}/>:<Moon size={17}/>}<span className="mode-label">{label}</span></button>;}
export function Toast(){const {notice,notify}=useUI();useEffect(()=>{if(notice){const t=setTimeout(()=>notify(''),6000);return()=>clearTimeout(t);}},[notice,notify]);return notice?<div className="toast" role="status"><AlertCircle size={18}/>{notice}<button aria-label="Закрыть уведомление" onClick={()=>notify('')}><X size={16}/></button></div>:null;}
export function Modal({open,onOpenChange,title,children}: {open:boolean;onOpenChange:(v:boolean)=>void;title:string;children:React.ReactNode}){return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content" aria-describedby={undefined}><div className="row between"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button className="icon-button" aria-label="Закрыть"><X/></button></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;}
export function Confirm({label,title,onConfirm,className,children}:{label?:string;title:string;onConfirm:()=>void|Promise<void>;className?:string;children?:React.ReactNode}){const [open,setOpen]=useState(false);return <><button className={className??'ghost danger'} onClick={()=>setOpen(true)} aria-label={label}>{children??label}</button><Modal open={open} onOpenChange={setOpen} title={title}><p className="muted">Это действие нельзя отменить. Продолжить?</p><div className="row end"><button className="ghost" onClick={()=>setOpen(false)}>Отмена</button><button className="button danger-fill" onClick={async()=>{try{await onConfirm();setOpen(false);}catch(e){useUI.getState().notify((e as Error).message);}}}>Подтвердить</button></div></Modal></>;}
export function useGame(role:'player'|'host'|'screen',sessionId?:string){
 const [socket,setSocket]=useState<Socket<ServerEvents,ClientEvents>|null>(null),[state,setState]=useState<Snapshot|null>(null),[connected,setConnected]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState(false);const actionInFlight=useRef(false);
 useEffect(()=>{const s:Socket<ServerEvents,ClientEvents>=io({transports:['websocket','polling']});setSocket(s);setState(null);s.on('session:state',setState);s.on('session:counts',c=>setState(v=>v?{...v,...c}:v));s.on('connect',()=>{setConnected(true);setError('');if(role!=='player'&&sessionId)s.emit('session:watch',{role,sessionId},r=>{if(!r.ok)setError(r.error);});else{try{const saved=JSON.parse(localStorage.getItem('pq_resume')??'null'),code=new URLSearchParams(location.search).get('code');if(saved&&(!code||saved.code===code))s.emit('session:resume',{token:saved.token},r=>{if(!r.ok){localStorage.removeItem('pq_resume');setState(null);setError(r.error);}});}catch{localStorage.removeItem('pq_resume');}}});s.on('disconnect',()=>setConnected(false));s.on('connect_error',()=>setError('Не удаётся подключиться. Проверяем соединение…'));s.on('participant:kicked',reason=>{setState(null);localStorage.removeItem('pq_resume');setError(reason);});s.on('connection:replaced',()=>{setState(null);setError('Игра открыта в другой вкладке. Закройте её и обновите эту страницу.');});const ping=setInterval(()=>{if(s.connected)s.emit('connection:ping',()=>{});},20000);return()=>{clearInterval(ping);s.disconnect();};},[role,sessionId]);
 const action=async(action:HostAction['action'],participantId?:string)=>{
  if(!socket?.connected||!sessionId||!state)throw Error('Нет соединения или состояния игры');
  if(actionInFlight.current)throw Error('Дождитесь завершения предыдущего действия');
  actionInFlight.current=true;setPending(true);
  try{await new Promise<void>((resolve,reject)=>{socket.timeout(5000).emit('host:action',{sessionId,action,participantId,expectedRevision:state.revision},(err,r)=>{if(err||!r.ok){const msg=err?'Сервер не ответил':!r.ok?r.error:'';useUI.getState().notify(msg);reject(Error(msg));}else resolve();});});}
  finally{actionInFlight.current=false;setPending(false);}
 };

 const submit=(questionId:string,value:AnswerValue)=>new Promise<void>((resolve,reject)=>{if(!socket?.connected){reject(Error('Нет соединения'));return;}socket.timeout(5000).emit('answer:submit',{questionId,value},(err,r)=>err?reject(Error('Нет подтверждения. Переподключитесь: принятый ответ сохранён.')):!r.ok?reject(Error(r.error)):resolve());});
 return {socket,state,connected,error,pending,action,submit};
}
export function useCountdown(state:Snapshot){const [now,setNow]=useState(Date.now());const [offset,setOffset]=useState(state.serverNow-Date.now());useEffect(()=>setOffset(state.serverNow-Date.now()),[state.serverNow]);useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(id);},[]);const t=state.timer;return t?Math.max(0,Math.ceil((t.paused?t.remainingMs:(t.endsAt??0)-now-offset)/1000)):0;}
