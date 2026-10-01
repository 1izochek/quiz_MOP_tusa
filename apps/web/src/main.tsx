import React,{Component,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
const Admin=lazy(()=>import('./pages/Admin').then(m=>({default:m.Admin})));
import {Player,Live} from './pages/Live';
import {Toast} from './lib';
import './style.css';
import './projector.css';
class ErrorBoundary extends Component<{children:React.ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<main className="empty"><h1>Кажется, что-то пошло не так</h1><p>Ответы и очки сохранены на сервере.</p><button className="button" onClick={()=>location.reload()}>Обновить страницу</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><BrowserRouter><Suspense fallback={<main className="empty">Загружаем вашу вечеринку…</main>}><Routes><Route path="/" element={<Navigate to="/admin" replace/>}/><Route path="/admin/*" element={<Admin/>}/><Route path="/play" element={<Player/>}/><Route path="/host/:sessionId" element={<Live role="host"/>}/><Route path="/screen/:sessionId" element={<Live role="screen"/>}/><Route path="*" element={<main className="empty"><h1>Здесь пока тихо</h1><a className="button" href="/play">Присоединиться к игре</a></main>}/></Routes></Suspense><Toast/></BrowserRouter></ErrorBoundary></React.StrictMode>);
