import 'dotenv/config';
import {openStore} from './db.js';
import {seed} from './seed.js';
const store=openStore(process.env.DATA_DIR??'data');if(process.argv[2]==='seed')seed(store);console.log(process.argv[2]==='seed'?'Демонстрационный квиз готов':'Миграция SQLite завершена');store.sqlite.close();
