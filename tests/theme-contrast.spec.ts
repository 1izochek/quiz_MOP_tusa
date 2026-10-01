import {test,expect,type Locator,type BrowserContext} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {newQuiz,newQuestion} from '../packages/shared/src/index.js';

let cookies:Awaited<ReturnType<BrowserContext['cookies']>>|undefined;
const check=expect.configure({soft:true,timeout:1000});

async function contrast(target:Locator){
 return target.evaluate(el=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d')!;
  const rgba=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data);};
  const blend=(front:number[],back:number[])=>front.slice(0,3).map((v,i)=>v*front[3]/255+back[i]*(1-front[3]/255));
  const layers:number[][]=[],filters:number[]=[];
  for(let node:Element|null=el;node;node=node.parentElement){
   const style=getComputedStyle(node),background=rgba(style.backgroundColor);layers.unshift(background);
   if(style.filter==='none')continue;
   const brightness=/^brightness\(([\d.]+)(%)?\)$/.exec(style.filter);
   if(!brightness||background[3]!==255)throw Error('Контраст этого фильтра нужно проверять по отрисованным пикселям');
   filters.push(Number(brightness[1])/(brightness[2]?100:1));
  }
  let background=layers.reduce((back,front)=>blend(front,back),[255,255,255]);
  let foreground=blend(rgba(getComputedStyle(el).color),background);
  for(const brightness of filters){
   background=background.map(v=>Math.min(255,v*brightness));foreground=foreground.map(v=>Math.min(255,v*brightness));
  }
  const luminance=(color:number[])=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });
}
async function readable(target:Locator){
 await expect(target).toBeVisible();
 await check.poll(()=>contrast(target),{message:`${target}: текст или иконка теряют контраст с фоном`}).toBeGreaterThanOrEqual(4.5);
}
async function warning(target:Locator){
 await check.poll(()=>target.evaluate(el=>{const [r,g]=getComputedStyle(el).color.match(/\d+/g)!.map(Number);return r-g;}),{message:`${target}: предупреждение потеряло красный цвет`}).toBeGreaterThan(50);
}

for(const palette of ['neon','disco','minimal','party'])for(const mode of ['light','dark']){
 test(`контраст и цвета действий сохраняются: ${palette}, ${mode}`,async({page})=>{
  if(!cookies){expect((await page.request.post('/api/login',{data:{password:'test-only-party-password'}})).status()).toBe(200);cookies=await page.context().cookies();}
  else await page.context().addCookies(cookies);
  await page.goto('/admin');await page.getByLabel('Тема интерфейса').selectOption(palette);
  if(mode==='dark')await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode',mode);
  await readable(page.locator('.local-badge'));await readable(page.locator('.hero .light-button'));
  await page.goto('/admin/media');
  const upload=page.locator('.upload-label.button');
  await readable(upload);await readable(upload.locator('svg'));await upload.hover();await readable(upload);
  const opposite=mode==='light'?'dark':'light';
  await page.getByRole('button',{name:mode==='light'?'Тёмная тема':'Светлая тема',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode',opposite);await readable(upload);await readable(upload.locator('svg'));
  await page.getByRole('button',{name:mode==='light'?'Светлая тема':'Тёмная тема',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode',mode);await readable(upload);
  const media=await page.request.post('/api/media',{multipart:{file:{name:'contrast-cover.png',mimeType:'image/png',buffer:readFileSync('assets/demo-poster.png')}}});expect(media.status()).toBe(200);
  const quiz=newQuiz();quiz.cover=(await media.json()).path;quiz.rounds[0].questions.push(newQuestion());
  expect((await page.request.put('/api/quizzes/'+quiz.id,{data:quiz})).status()).toBe(200);
  await page.goto('/admin/edit/'+quiz.id);
  await readable(page.locator('.round-intro-label').first());await readable(page.locator('.question-list-item.selected>button>span'));
  const saved=page.locator('.save-state.saved');await expect(saved).toBeVisible();await readable(saved);
  await check.poll(()=>saved.evaluate(el=>{const [r,g]=getComputedStyle(el).color.match(/\d+/g)!.map(Number);return g-r;}),{message:'Сохранённые изменения потеряли цвет успеха'}).toBeGreaterThan(20);
  for(const action of [page.getByRole('button',{name:'Удалить вопрос',exact:true}),page.getByRole('button',{name:'Убрать Обложка квиза',exact:true})]){
   await warning(action);await readable(action);await action.hover();await warning(action);await readable(action);
  }
  await readable(page.locator('.upload-field .upload-label').first());
  if(palette==='neon'&&mode==='light'){
   await page.screenshot({path:'work/contrast-editor.png',fullPage:true});
   await page.goto('/admin/media');await expect(page.locator('.upload-label.button')).toBeVisible();
   await page.screenshot({path:'work/contrast-media.png'});
  }
 });
}
