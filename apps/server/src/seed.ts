import {randomUUID} from 'node:crypto';
import {newQuestion,type Quiz,type Question,quizSchema} from '../../../packages/shared/src/index.js';
import type {Store} from './db.js';
import {copyFileSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {mediaFiles} from './schema.js';
export function demoQuiz():Quiz{
 const make=(text:string,options:string[],correct:number[],extra:Partial<Question>={}):Question=>{const q=newQuestion();q.text=text;q.options=options.map(text=>({id:randomUUID(),text}));q.correct=correct.map(i=>q.options[i].id);return {...q,...extra};};
 return quizSchema.parse({id:randomUUID(),title:'Вечер, который запомнится',description:'Три раунда, неожиданные открытия и одна отличная компания. Поехали?',theme:'neon',cover:'',rounds:[
 {id:randomUUID(),title:'Разогреваемся',questions:[
 make('Какая планета ближе всего к Солнцу?',['Венера','Меркурий','Марс','Земля'],[1],{explanation:'Меркурий — первая планета от Солнца.'}),
 make('Выберите все чётные числа',['2','3','8','11'],[0,2],{type:'multiple',explanation:'2 и 8 делятся на два без остатка.'}),
 make('Как называется столица России?',[],[],{type:'text',correct:['Москва','город Москва'],explanation:'Москва. Регистр, лишние пробелы и ё/е не влияют на ответ.'}),
 make('Сколько минут в двух часах?',[],[],{type:'number',numericAnswer:120,tolerance:0}),
 ]},
 {id:randomUUID(),title:'Включаем воображение',questions:[
 make('Расположите времена года, начиная с весны',['Весна','Лето','Осень','Зима'],[0,1,2,3],{type:'order'}),
 make('Что делает вечеринку идеальной?',['Музыка','Друзья','Вкусная еда','Всё сразу'],[],{type:'poll',points:0,speedBonus:false}),
 make('Маленькая пауза для большого настроения',[],[],{type:'info',explanation:'Поднимите бокалы с любимым напитком и улыбнитесь соседу. Следующий вопрос уже близко!',points:0}),
 make('Какая фигура на изображении?',['Круг','Квадрат','Треугольник','Звезда'],[0],{image:'/uploads/demo-poster.png',explanation:'На постере — фиолетовый круг.'}),
 make('Сколько цветов у радуги в привычном русском счёте?',['Пять','Шесть','Семь','Восемь'],[2],{explanation:'Семь: красный, оранжевый, жёлтый, зелёный, голубой, синий, фиолетовый.'}),
 ]},
 {id:randomUUID(),title:'Смотрим в оба',questions:[
 make('Демо видео: какой цвет у первого круга?',['Фиолетовый','Зелёный','Красный','Жёлтый'],[0],{type:'video',video:'/uploads/demo.webm',poster:'/uploads/demo-poster.png',explanation:'Первый круг фиолетовый. Замените демонстрационный ролик своим в редакторе.'}),
 make('Угадай продолжение: во что превратится круг?',['В звезду','В квадрат','В треугольник','Останется кругом'],[0],{type:'prediction',video:'/uploads/demo.webm',poster:'/uploads/demo-poster.png',pauseAtSeconds:3,explanation:'Круг превращается в жёлтую звезду!'}),
 make('Какой инструмент обычно имеет 88 клавиш?',['Гитара','Фортепиано','Скрипка','Барабан'],[1]),
 make('Сколько сторон у шестиугольника?',[],[],{type:'number',numericAnswer:6,tolerance:0,explanation:'Шесть сторон. Спасибо за игру!'}),
 ]}]});
}
export function seed(store:Store){for(const [file,mime] of [['demo.webm','video/webm'],['demo-poster.png','image/png']]){const source=resolve('assets',file),target=resolve(store.dir,'uploads',file);if(existsSync(source)){if(!existsSync(target))copyFileSync(source,target);store.db.insert(mediaFiles).values({id:'seed-'+file,path:'/uploads/'+file,name:file,mime,size:statSync(target).size,createdAt:Date.now()}).onConflictDoNothing().run();}}if(store.quizzes().length)return;store.saveQuiz(demoQuiz());}
