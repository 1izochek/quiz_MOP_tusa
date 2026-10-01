import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {newQuiz} from '../packages/shared/src/index.js';

let cookies: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
async function login(page:Page) {
 if(!cookies){expect((await page.request.post('/api/login',{data:{password:'test-only-party-password'}})).status()).toBe(200);cookies=await page.context().cookies();}
 else await page.context().addCookies(cookies);
}
async function light(page:Page,selector:string) {
 const surface=page.locator(selector).first();
 await expect(surface).toBeVisible();
 await expect.poll(()=>surface.evaluate(el=>Math.min(...getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0,3).map(Number)))).toBeGreaterThan(210);
}
async function dark(page:Page,selector:string) {
 await expect.poll(()=>page.locator(selector).first().evaluate(el=>Math.max(...getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0,3).map(Number)))).toBeLessThan(50);
}

test('светлый режим доступен на входе и сохраняется на всех страницах студии',async({page})=>{
 await page.goto('/admin');await light(page,'.login-page');await light(page,'.login-card');
 await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();await dark(page,'.login-card');
 await page.reload();await dark(page,'.login-card');
 await page.getByRole('button',{name:'Светлая тема',exact:true}).click();
 await login(page);await page.reload();await light(page,'.admin-shell');await light(page,'.sidebar');
 for(const route of ['/admin/sessions','/admin/media','/play','/missing-page']){
  await page.goto(route);await light(page,route==='/play'?'.player-page':'body');
 }
});

test('все палитры и диалоги редактора используют выбранный режим',async({page})=>{
 await login(page);await page.goto('/admin');
 for(const palette of ['neon','disco','minimal','party']){
  await page.getByLabel('Тема интерфейса').selectOption(palette);await light(page,'.admin-shell');await light(page,'.sidebar');
  await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();await dark(page,'.admin-shell');
  await page.getByRole('button',{name:'Светлая тема',exact:true}).click();
 }
 const quiz=newQuiz();quiz.title='Светлый редактор';await page.request.put('/api/quizzes/'+quiz.id,{data:quiz});
 await page.goto('/admin/edit/'+quiz.id);await light(page,'.question-editor');
 const field=page.getByLabel('Название квиза');await field.blur();
 const border=await field.evaluate(el=>getComputedStyle(el).borderColor);await field.focus();
 await expect.poll(()=>field.evaluate(el=>getComputedStyle(el).borderColor)).not.toBe(border);
 await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();await light(page,'.dialog-content');
 await page.screenshot({path:'work/site-light-editor.png',fullPage:true});
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();await dark(page,'.question-editor');
 await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();
 await expect.poll(()=>page.locator('.preview-card h2').evaluate(el=>Math.max(...getComputedStyle(el).color.match(/\d+/g)!.slice(0,3).map(Number)))).toBeGreaterThan(150);
 await page.screenshot({path:'work/site-dark-preview.png'});
 await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Светлая тема',exact:true}).click();await light(page,'.question-editor');
});

test('лобби одновременно показывает QR, обложку и гостей; старт открывает первый раунд',async({page,browser})=>{
 await login(page);
 const uploaded=await page.request.post('/api/media',{multipart:{file:{name:'cover.png',mimeType:'image/png',buffer:readFileSync('assets/demo-poster.png')}}});
 expect(uploaded.status()).toBe(200);
 const quiz=newQuiz();quiz.title='Обложка и QR';quiz.cover=(await uploaded.json()).path;quiz.rounds[0].questions[0].duration=5;
 expect((await page.request.put('/api/quizzes/'+quiz.id,{data:quiz})).status()).toBe(200);
 const game=await(await page.request.post('/api/sessions',{data:{quizId:quiz.id}})).json();
 await page.goto('/host/'+game.id);
 const screen=await page.context().newPage();await screen.setViewportSize({width:1920,height:1080});await screen.goto('/screen/'+game.id);
 await expect(screen.getByAltText('QR-код для входа в игру')).toBeVisible();await expect(screen.getByAltText('Обложка квиза')).toBeVisible();
 await expect(screen.locator('.lobby-copy h1')).toHaveText(quiz.title);
 const guestContext=await browser.newContext({viewport:{width:390,height:844}}),guest=await guestContext.newPage();
 try {
  await guest.goto('/play?code='+game.code);await light(guest,'.player-page');
  await guest.getByLabel('Как вас представить?').fill('Гость лобби');await guest.getByRole('button',{name:'Присоединиться'}).click();
  await expect(screen.locator('.lobby-copy .pill')).toContainText('1 гостей');
  for(const size of [{width:1920,height:1080},{width:1024,height:768}]){
   await screen.setViewportSize(size);
   await expect.poll(async()=>(await screen.getByAltText('Обложка квиза').boundingBox())!.height).toBeGreaterThan(180);
   const qr=await screen.locator('.qr-card').boundingBox(),cover=await screen.locator('.lobby-copy').boundingBox();
   expect(qr!.x+qr!.width).toBeLessThanOrEqual(cover!.x);expect(qr!.x+qr!.width/2).toBeGreaterThan(size.width*.2);
   for(const box of [qr!,cover!]){expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(size.height);}
  }
  await screen.screenshot({path:'work/site-lobby.png'});
  await light(page,'.host-controls');await light(screen,'.stage');
  await page.getByRole('button',{name:'Тёмная тема',exact:true}).focus();await page.keyboard.press('Space');
  await dark(page,'.host-controls');await dark(screen,'.stage');await expect(screen.locator('.stage')).toHaveAttribute('data-phase','LOBBY');
  await dark(page,'.host-controls .ghost');
  await expect.poll(()=>page.getByRole('button',{name:'Завершить игру',exact:true}).evaluate(el=>{const [r,g]=getComputedStyle(el).color.match(/\d+/g)!.slice(0,3).map(Number);return r-g;})).toBeGreaterThan(50);
  await page.getByRole('button',{name:'Светлая тема',exact:true}).click();await light(screen,'.stage');
  await page.getByRole('button',{name:'Начать игру',exact:true}).click();
  await expect(screen.locator('.stage')).toHaveAttribute('data-phase','ROUND_INTRO');await expect(screen.locator('.qr-card')).toHaveCount(0);
  await expect(guest.getByRole('heading',{name:quiz.rounds[0].title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Первый вопрос',exact:true}).click();await expect(guest.getByRole('button',{name:'Это мой ответ'})).toBeVisible();
  await page.getByRole('button',{name:'Пауза таймера',exact:true}).click();
  for(const view of [screen,guest]){
   await expect.poll(()=>view.locator('.timer.urgent').evaluate(el=>{const [r,g]=getComputedStyle(el).color.match(/\d+/g)!.slice(0,3).map(Number);return r-g;})).toBeGreaterThan(50);
  }
  await guest.getByRole('button',{name:'Тёмная тема',exact:true}).click();await dark(guest,'.player-page');
  await page.getByRole('button',{name:'Тёмная тема',exact:true}).click();await dark(screen,'.stage');
  await screen.screenshot({path:'work/site-dark-question.png'});await guest.screenshot({path:'work/site-dark-guest.png'});
 } finally {await guestContext.close();await screen.close();}
});
