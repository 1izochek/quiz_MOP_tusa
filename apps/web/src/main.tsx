import React,{Component,lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {createBrowserRouter,RouterProvider,Navigate} from 'react-router-dom';
const Admin=lazy(()=>import('./pages/Admin').then(m=>({default:m.Admin})));
import {Player,Live} from './pages/Live';
import {ThemeRoot,Toast} from './lib';
import './style.css';
import './themes.css';
class ErrorBoundary extends Component<{children:React.ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<main className="empty"><h1>Кажется, что-то пошло не так</h1><p>Ответы и очки сохранены на сервере.</p><button className="button" onClick={()=>location.reload()}>Обновить страницу</button></main>:this.props.children;}}
const router=createBrowserRouter([
 {path:'/',element:<Navigate to="/admin" replace/>},
 {path:'/admin/*',element:<Admin/>},
 {path:'/play',element:<Player/>},
 {path:'/host/:sessionId',element:<Live role="host"/>},
 {path:'/screen/:sessionId',element:<Live role="screen"/>},
 {path:'*',element:<main className="empty"><h1>Здесь пока тихо</h1><a className="button" href="/play">Присоединиться к игре</a></main>}
]);
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><ThemeRoot/><Suspense fallback={<main className="empty">Загружаем вашу вечеринку…</main>}><RouterProvider router={router}/></Suspense><Toast/></ErrorBoundary></React.StrictMode>);
