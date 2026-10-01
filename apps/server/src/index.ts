import 'dotenv/config';
import {resolve} from 'node:path';
import {createApp} from './app.js';
const server=createApp({dataDir:resolve(process.env.DATA_DIR??'data'),password:process.env.ADMIN_PASSWORD??'',port:Number(process.env.PORT??3000),baseUrl:process.env.PUBLIC_BASE_URL,secureCookie:process.env.COOKIE_SECURE==='true',trustProxy:process.env.TRUST_PROXY==='true',maxUploadMb:Number(process.env.MAX_UPLOAD_MB??200),maxPlayers:Number(process.env.MAX_PARTICIPANTS??200),blocklist:(process.env.NICKNAME_BLOCKLIST??'').split(',').filter(Boolean)});
await server.listen();console.log(`Party Quiz: ${server.engine.baseUrl} · панель /admin`);
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await server.close();process.exit(0);});
