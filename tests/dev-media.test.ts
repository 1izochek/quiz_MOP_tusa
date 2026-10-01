import {afterAll, beforeAll, expect, it} from 'vitest';
import {createServer, type ViteDevServer} from 'vite';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {AddressInfo} from 'node:net';

let server: ViteDevServer, base: string, dir: string, video: string;
beforeAll(async () => {
  mkdirSync('work', {recursive: true});
  dir = mkdtempSync(resolve('work/vite-private-'));
  video = resolve(dir, 'original.webm');
  writeFileSync(video, readFileSync('assets/demo.webm'));
  server = await createServer({configFile: resolve('vite.config.ts'), logLevel: 'silent', optimizeDeps: {noDiscovery: true, include: []}, server: {host: '127.0.0.1', port: 0}});
  await server.listen();
  base = 'http://127.0.0.1:' + (server.httpServer!.address() as AddressInfo).port;
});
afterAll(async () => {await server?.close(); if (dir) rmSync(dir, {recursive: true, force: true});});

it('Vite не выдает оригиналы видео в обход /uploads через /@fs', async () => {
  const response = await fetch(base + '/@fs' + video, {headers: {Range: 'bytes=-16'}});
  expect(response.status).toBe(403);
  expect(Buffer.from(await response.arrayBuffer()).includes(readFileSync(video).subarray(-16))).toBe(false);
});
it('Vite продолжает отдавать приложение и общий модуль', async () => {
  for (const path of ['/src/main.tsx', '/@fs' + resolve('packages/shared/src/index.ts'), '/@vite/client']) {
    const response = await fetch(base + path);
    await response.arrayBuffer();
    expect(response.status).toBe(200);
  }
});
