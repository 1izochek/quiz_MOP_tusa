import {test, expect, type Page, type BrowserContext} from '@playwright/test';
import {io} from 'socket.io-client';
import {readFileSync} from 'node:fs';
import {newQuiz} from '../packages/shared/src/index.js';

let adminCookies: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
async function login(page: Page, fresh = false) {
  if (!adminCookies || fresh) {
    const response = await page.request.post('/api/login', {data: {password: 'test-only-party-password'}});
    expect(response.status()).toBe(200);
    adminCookies = await page.context().cookies();
  } else await page.context().addCookies(adminCookies);
}
async function editor(page: Page) {
  await login(page);
  const quiz = newQuiz(); quiz.title = 'Редактор ' + crypto.randomUUID().slice(0, 8);
  expect((await page.request.put('/api/quizzes/' + quiz.id, {data: quiz})).ok()).toBe(true);
  await page.goto('/admin');
  await page.getByRole('link', {name: quiz.title, exact: true}).click();
  await expect(page.getByLabel('Название квиза')).toHaveValue(quiz.title);
  return quiz;
}
async function storedTitle(page: Page, id: string) {
  const rows = await (await page.request.get('/api/quizzes')).json();
  return rows.find((q: {id: string}) => q.id === id)?.title;
}

for (const destination of ['История игр', 'Медиатека', 'Мои квизы']) {
  test('сохраняет немедленную правку при переходе: ' + destination, async ({page}) => {
    const quiz = await editor(page);
    await page.getByLabel('Название квиза').fill('Сохранено перед переходом');
    await page.locator('.sidebar').getByRole('link', {name: destination, exact: true}).click();
    await expect(page).not.toHaveURL(/\/edit\//);
    expect(await storedTitle(page, quiz.id)).toBe('Сохранено перед переходом');
  });
}
test('сохраняет правку перед browser Back', async ({page}) => {
  const quiz = await editor(page);
  await page.getByLabel('Название квиза').fill('Сохранено перед Back');
  await page.goBack();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await storedTitle(page, quiz.id)).toBe('Сохранено перед Back');
});
test('сохраняет правку перед выходом из студии', async ({page}) => {
  const quiz = await editor(page);
  await page.getByLabel('Название квиза').fill('Сохранено перед выходом');
  await page.getByRole('button', {name: 'Выйти', exact: true}).click();
  await expect(page.getByLabel('Пароль ведущего')).toBeVisible();
  await login(page, true);
  expect(await storedTitle(page, quiz.id)).toBe('Сохранено перед выходом');
});
test('ошибка записи оставляет правки в редакторе и позволяет повторить сохранение', async ({page}) => {
  const quiz = await editor(page);
  await page.route('**/api/quizzes/' + quiz.id, async route => {
    if (route.request().method() === 'PUT') await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error: 'Тестовая ошибка записи'})});
    else await route.continue();
  });
  await page.getByLabel('Название квиза').fill('Не потерять при ошибке');
  await page.getByRole('link', {name: 'Медиатека', exact: true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp('/edit/' + quiz.id));
  await expect(page.getByLabel('Название квиза')).toHaveValue('Не потерять при ошибке');
  await page.unroute('**/api/quizzes/' + quiz.id);
  await page.getByRole('button', {name: 'Повторить сохранение', exact: true}).click();
  await expect(page).toHaveURL(/\/admin\/media$/);
  expect(await storedTitle(page, quiz.id)).toBe('Не потерять при ошибке');
});
test('не уходит молча с невалидными полями', async ({page}) => {
  const quiz = await editor(page);
  await page.getByLabel('Название квиза').fill('');
  await page.getByRole('link', {name: 'История игр', exact: true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(new RegExp('/edit/' + quiz.id));
  await page.getByRole('button', {name: 'Остаться', exact: true}).click();
  await page.getByLabel('Название квиза').fill('Исправленное название');
  await page.getByRole('link', {name: 'История игр', exact: true}).click();
  await expect(page).toHaveURL(/\/admin\/sessions$/);
  expect(await storedTitle(page, quiz.id)).toBe('Исправленное название');
});
test('переход дожидается текущего автосохранения и записывает следующую правку', async ({page}) => {
  const quiz = await editor(page);
  let release!: () => void, started!: () => void, first = true;
  const held = new Promise<void>(resolve => {release = resolve;});
  const saving = new Promise<void>(resolve => {started = resolve;});
  await page.route('**/api/quizzes/' + quiz.id, async route => {
    if (route.request().method() === 'PUT' && first) {first = false; started(); await held;}
    await route.continue();
  });
  await page.getByLabel('Название квиза').fill('Первая правка');
  await saving;
  await page.getByLabel('Название квиза').fill('Самая свежая правка');
  await page.getByRole('link', {name: 'Медиатека', exact: true}).click();
  await expect(page).toHaveURL(new RegExp('/edit/' + quiz.id));
  release();
  await expect(page).toHaveURL(/\/admin\/media$/);
  expect(await storedTitle(page, quiz.id)).toBe('Самая свежая правка');
});
test('сохраняет правку, сделанную во время ожидания перехода', async ({page}) => {
  const quiz = await editor(page);
  let release!: () => void, started!: () => void, first = true;
  const held = new Promise<void>(resolve => {release = resolve;});
  const saving = new Promise<void>(resolve => {started = resolve;});
  await page.route('**/api/quizzes/' + quiz.id, async route => {
    if (route.request().method() === 'PUT' && first) {first = false; started(); await held;}
    await route.continue();
  });
  await page.getByLabel('Название квиза').fill('Сохраняется при переходе');
  await page.getByRole('link', {name: 'Медиатека', exact: true}).click();
  await saving;
  await page.getByLabel('Название квиза').fill('Правка во время сохранения');
  release();
  await expect(page).toHaveURL(/\/admin\/media$/);
  expect(await storedTitle(page, quiz.id)).toBe('Правка во время сохранения');
});
test('возврат исходного текста во время записи не пропускает сохранение', async ({page}) => {
  const quiz = await editor(page);
  let release!: () => void, started!: () => void, first = true;
  const held = new Promise<void>(resolve => {release = resolve;});
  const saving = new Promise<void>(resolve => {started = resolve;});
  await page.route('**/api/quizzes/' + quiz.id, async route => {
    if (route.request().method() === 'PUT' && first) {first = false; started(); await held;}
    await route.continue();
  });
  await page.getByLabel('Название квиза').fill('Промежуточная правка');
  await saving;
  await page.getByLabel('Название квиза').fill(quiz.title);
  await page.getByRole('link', {name: 'Медиатека', exact: true}).click();
  await expect(page).toHaveURL(new RegExp('/edit/' + quiz.id));
  release();
  await expect(page).toHaveURL(/\/admin\/media$/);
  expect(await storedTitle(page, quiz.id)).toBe(quiz.title);
});
test('ошибка сохранения при выходе оставляет редактор и авторизацию', async ({page}) => {
  const quiz = await editor(page);
  await page.route('**/api/quizzes/' + quiz.id, route => route.fulfill({status: 500, contentType: 'application/json', body: '{"error":"Ошибка записи"}'}));
  await page.getByLabel('Название квиза').fill('Не потерять при выходе');
  await page.getByRole('button', {name: 'Выйти', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Ошибка записи');
  await expect(page.getByLabel('Название квиза')).toHaveValue('Не потерять при выходе');
  expect((await page.request.get('/api/admin')).status()).toBe(200);
});

async function hostAtIntro(page: Page) {
  await login(page);
  const quiz = newQuiz();
  expect((await page.request.put('/api/quizzes/' + quiz.id, {data: quiz})).ok()).toBe(true);
  const game = await (await page.request.post('/api/sessions', {data: {quizId: quiz.id}})).json();
  const cookies = await page.context().cookies();
  const cookie = cookies.map(c => c.name + '=' + c.value).join('; ');
  const socket = io('http://127.0.0.1:3099', {transports: ['websocket'], extraHeaders: {cookie}});
  try {
    await new Promise<void>((resolve, reject) => {socket.once('connect', resolve); socket.once('connect_error', reject);});
    const ack = (event: string, data: unknown) => new Promise<any>(resolve => socket.emit(event, data, resolve));
    expect((await ack('session:watch', {sessionId: game.id, role: 'host'})).ok).toBe(true);
    expect((await ack('host:action', {sessionId: game.id, action: 'next', expectedRevision: 0})).ok).toBe(true);
  } finally {socket.disconnect();}
  await page.goto('/host/' + game.id);
  await expect(page.getByRole('button', {name: 'Первый вопрос', exact: true})).toBeEnabled();
}
for (const delay of [70, 450]) test('двойной клик (' + delay + ' мс) оставляет прием ответов открытым', async ({page}) => {
  await hostAtIntro(page);
  await page.getByRole('button', {name: 'Первый вопрос', exact: true}).dblclick({delay});
  await expect(page.getByRole('button', {name: 'Закрыть ответы', exact: true})).toBeVisible();
  await expect(page.getByText('Приём ответов закрыт', {exact: false})).not.toBeVisible();
});
for (const key of ['Space', 'ArrowRight']) {
  test('удержание ' + key + ' не пропускает этапы', async ({page}) => {
    await hostAtIntro(page);
    await page.getByRole('button', {name: 'Первый вопрос', exact: true}).focus();
    await page.keyboard.down(key);
    await expect(page.getByRole('button', {name: 'Закрыть ответы', exact: true})).toBeEnabled();
    for (let i = 0; i < 4; i++) await page.keyboard.down(key);
    await page.keyboard.up(key);
    await expect(page.getByRole('button', {name: 'Закрыть ответы', exact: true})).toBeVisible();
  });
}
test('видео доступно проектору ведущего, гостю недоступны оригинал и роль screen', async ({page, browser}) => {
  await login(page);
  const upload = await page.request.post('/api/media', {multipart: {file: {name: 'continuation.webm', mimeType: 'video/webm', buffer: readFileSync('assets/demo.webm')}}});
  expect(upload.status()).toBe(200);
  const media = await upload.json(), quiz = newQuiz(), q = quiz.rounds[0].questions[0];
  q.type = 'prediction'; q.video = media.path; q.pauseAtSeconds = 1;
  expect((await page.request.put('/api/quizzes/' + quiz.id, {data: quiz})).ok()).toBe(true);
  const game = await (await page.request.post('/api/sessions', {data: {quizId: quiz.id}})).json();
  await page.goto('/host/' + game.id);
  const screen = await page.context().newPage();
  await screen.goto('/screen/' + game.id);
  await expect(screen.locator('.game-code')).toBeVisible();
  await page.getByRole('button', {name: 'Начать игру', exact: true}).click();
  await page.getByRole('button', {name: 'Первый вопрос', exact: true}).click();
  await expect.poll(() => screen.locator('video').evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', {name: 'Включить видео', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Закрыть ответы', exact: true})).toBeEnabled();
  await expect.poll(() => page.locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(1, 1);
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    expect((await guest.request.get(media.path, {headers: {Range: 'bytes=-16'}})).status()).toBe(401);
    await guest.goto('/screen/' + game.id);
    await expect(guest.getByRole('heading')).toContainText('Войдите в студию');
    await expect(guest.locator('video')).toHaveCount(0);
  } finally {await guestContext.close(); await screen.close();}
});
