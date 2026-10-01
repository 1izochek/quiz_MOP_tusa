import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const repoDir=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root:'apps/web',plugins:[react(),tailwind()],build:{outDir:'../../dist/web',emptyOutDir:true},server:{port:5173,fs:{allow:[resolve(repoDir,'apps/web'),resolve(repoDir,'packages/shared'),realpathSync(resolve(repoDir,'node_modules'))]},proxy:{'/api':'http://127.0.0.1:3000','/uploads':'http://127.0.0.1:3000','/socket.io':{target:'http://127.0.0.1:3000',ws:true}}}});
