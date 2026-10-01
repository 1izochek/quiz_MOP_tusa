import {test,expect} from '@playwright/test';
test('создание квиза → гость → ответ → результат → лидерборд → финал',async({page,browser})=>{
 await page.goto('/admin');await page.getByLabel('Пароль ведущего').fill('test-only-party-password');await page.getByRole('button',{name:'Войти в студию'}).click();await page.getByRole('button',{name:'Создать квиз',exact:true}).click();
 await page.getByLabel('Название квиза').fill('Вечеринка Playwright');await page.getByLabel('Текст вопроса').fill('Сколько будет два плюс два?');await page.getByLabel('Вариант 1',{exact:true}).fill('Четыре');await page.getByLabel('Вариант 2',{exact:true}).fill('Пять');await expect(page.getByText('Все изменения сохранены')).toBeVisible();
 await page.screenshot({path:'work/editor.png',fullPage:true});await page.getByRole('button',{name:'Начать игру',exact:true}).click();await expect(page).toHaveURL(/\/host\//);const code=await page.locator('.game-code').innerText();const sid=page.url().split('/').pop()!;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const guest=await context.newPage();await guest.goto('/play?code='+code.trim());await guest.getByLabel('Как вас представить?').fill('Лиза');await guest.getByRole('button',{name:'Присоединиться'}).click();await expect(guest.getByText('ВЫ В СПИСКЕ ГОСТЕЙ')).toBeVisible();
 const screen=await browser.newPage({viewport:{width:1920,height:1080}});await screen.goto('/screen/'+sid);await expect(screen.locator('.game-code')).toContainText(code);await screen.screenshot({path:'work/projector.png',fullPage:true});
 await page.getByRole('button',{name:'Показать обложку',exact:true}).click();await expect(screen.locator('.quiz-cover-slide h1')).toHaveText('Вечеринка Playwright');await page.getByRole('button',{name:'Первый раунд',exact:true}).click();await page.getByRole('button',{name:'Первый вопрос',exact:true}).click();await expect(guest.getByRole('button',{name:/Четыре/})).toBeVisible();await guest.screenshot({path:'work/phone.png',fullPage:true});await guest.getByRole('button',{name:/Четыре/}).click();await guest.getByRole('button',{name:'Это мой ответ'}).click();await expect(guest.getByText('Ответ принят!',{exact:true})).toBeVisible();await guest.reload();await expect(guest.getByText('Ответ принят!',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть ответы',exact:true}).click();await page.getByRole('button',{name:'Показать ответ',exact:true}).click();await expect(guest.getByText('Вот это ответ!')).toBeVisible();await page.getByRole('button',{name:'Итоги раунда',exact:true}).click();await expect(screen.getByRole('heading',{name:'Кто впереди?'})).toBeVisible();await expect(guest.locator('.own-rank')).toContainText('#1');await page.getByRole('button',{name:'Показать финал',exact:true}).click();await expect(screen.getByRole('heading',{name:'Ваши аплодисменты!'})).toBeVisible();await screen.screenshot({path:'work/final.png',fullPage:true});
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Скачать XLSX'}).click();expect((await download).suggestedFilename()).toBe('party-results.xlsx');await context.close();await screen.close();
});

test('светлый проектор, крупная обложка и 100 текстовых формулировок',async({page,browser,request})=>{
 await page.goto('/admin');await page.getByLabel('Пароль ведущего').fill('test-only-party-password');await page.getByRole('button',{name:'Войти в студию'}).click();
 await page.getByRole('button',{name:'Создать квиз',exact:true}).click();await page.getByLabel('Название квиза').fill('Большой вечер');
 await page.getByLabel('Тип карточки').selectOption('text');await page.getByLabel('Текст вопроса').fill('Как называется наша команда?');
 const alternatives=Array.from({length:100},(_,i)=>`Команда ${i+1}`);
 await page.getByLabel('Допустимые ответы').fill(alternatives.join('\n'));
 await expect(page.getByText('Все изменения сохранены')).toBeVisible();
 await page.getByRole('button',{name:'Предпросмотр',exact:true}).click();await expect(page.locator('.preview-card .answer-option')).toHaveCount(0);await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('button',{name:'Начать игру',exact:true}).click();await expect(page).toHaveURL(/\/host\//);
 const code=(await page.locator('.game-code').innerText()).trim(),sid=page.url().split('/').pop()!;
 const screen=await browser.newPage({viewport:{width:1920,height:1080}});await screen.goto('/screen/'+sid);
 await expect(screen.locator('.stage')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.getByRole('button',{name:'Показать обложку',exact:true}).click();await expect(screen.locator('.quiz-cover-slide h1')).toHaveText('Большой вечер');await expect(screen.locator('.qr-card')).toHaveCount(0);
 await screen.screenshot({path:'work/projector-light-cover.png'});
 await page.getByRole('button',{name:'Первый раунд',exact:true}).click();await page.getByRole('button',{name:'Первый вопрос',exact:true}).click();await page.getByRole('button',{name:'Пауза таймера',exact:true}).click();
 for(const size of [{width:1920,height:1080},{width:1024,height:768}]){
  await screen.setViewportSize(size);await expect(screen.locator('.free-answer-prompt')).toContainText('Введите ответ на телефоне');await expect(screen.locator('.answer-option')).toHaveCount(0);
  const bounds=await screen.locator('.question-stage').boundingBox();expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(size.height);
  await screen.screenshot({path:`work/projector-text-${size.width}.png`});
 }
 const guest=await browser.newPage({viewport:{width:390,height:844}});await guest.goto('/play?code='+code);await guest.getByLabel('Как вас представить?').fill('Текстовый гость');await guest.getByRole('button',{name:'Присоединиться'}).click();
 await page.getByRole('button',{name:'Продолжить таймер',exact:true}).first().click();await guest.getByLabel('Ваш ответ',{exact:true}).fill(alternatives[99]);await guest.getByRole('button',{name:'Это мой ответ'}).click();await expect(guest.getByText('Ответ принят!',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть ответы',exact:true}).click();await page.getByRole('button',{name:'Показать ответ',exact:true}).click();await expect(guest.getByText('Вот это ответ!')).toBeVisible();await expect(screen.locator('.correct-line')).toHaveText('Команда 1');await expect(screen.locator('.answer-option')).toHaveCount(0);
 await request.get('/api/health');await guest.close();await screen.close();
});
