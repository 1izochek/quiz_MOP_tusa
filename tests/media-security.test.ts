import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {copyFileSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io, type Socket} from 'socket.io-client';
import {createApp} from '../apps/server/src/app.js';
import {seed} from '../apps/server/src/seed.js';
import type {Snapshot} from '../packages/shared/src/index.js';

describe('Авторизация проектора и полных видеофайлов', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-media-'));
  const password = 'test-only-media-password';
  let server: ReturnType<typeof createApp>, url: string, cookie: string, sessionId: string;
  const sockets: Socket[] = [];
  const ack = (socket: Socket, event: string, data: unknown) => new Promise<any>((resolve, reject) => socket.timeout(5000).emit(event, data, (error: Error | null, reply: unknown) => error ? reject(error) : resolve(reply)));
  const connect = async (authenticated = false) => {
    const socket = io(url, {transports: ['websocket'], forceNew: true, extraHeaders: authenticated ? {cookie} : undefined});
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {socket.once('connect', resolve); socket.once('connect_error', reject);});
    return socket;
  };
  beforeAll(async () => {
    server = createApp({password, dataDir: dir, port: 0});
    seed(server.store);
    copyFileSync('assets/demo.webm', join(dir, 'uploads', 'recovered.webm'));
    const quiz = server.store.quizzes()[0];
    quiz.rounds = [{...quiz.rounds[2], questions: [quiz.rounds[2].questions[1]]}];
    const game = await server.engine.create(quiz);
    sessionId = game.id;
    server.engine.action({sessionId, action: 'next'});
    server.engine.action({sessionId, action: 'next'});
    server.engine.action({sessionId, action: 'next'});
    url = 'http://127.0.0.1:' + await server.listen(0);
    const login = await fetch(url + '/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password})});
    cookie = login.headers.get('set-cookie')!.split(';')[0];
  });
  afterAll(async () => {
    sockets.forEach(s => s.disconnect());
    await server?.close();
    rmSync(dir, {recursive: true, force: true});
  });

  it('не пускает гостя в screen и не отправляет ему последующие broadcasts', async () => {
    const socket = await connect(), states: Snapshot[] = [];
    socket.on('session:state', state => states.push(state));
    expect((await ack(socket, 'session:watch', {role: 'screen', sessionId})).ok).toBe(false);
    server.engine.action({sessionId, action: 'mediaReady'});
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(states).toHaveLength(0);
  });

  it('сохраняет обычный проектор ведущего и скрывает video от игрока', async () => {
    const screen = await connect(true);
    const state = new Promise<Snapshot>(resolve => screen.once('session:state', resolve));
    expect((await ack(screen, 'session:watch', {role: 'screen', sessionId})).ok).toBe(true);
    expect((await state).question?.video).toBe('/uploads/demo.webm');
    const player = await connect();
    const playerState = new Promise<Snapshot>(resolve => player.once('session:state', resolve));
    expect((await ack(player, 'session:join', {code: server.engine.get(sessionId).code, nickname: 'Гость'})).ok).toBe(true);
    expect((await playerState).question?.video).toBe('');
  });

  it.each([
    ['/uploads/demo.webm', {}],
    ['/uploads/demo%2Eweb%6D', {}],
    ['/UPLOADS/demo.webm?as=image.png', {}],
    ['/uploads/demo.WEBM', {}],
    ['/uploads/recovered.webm', {}],
    ['/uploads/demo.webm', {method: 'HEAD'}],
    ['/uploads/demo.webm', {headers: {Range: 'bytes=0-15'}}],
    ['/uploads/demo.webm', {headers: {Range: 'bytes=-16'}}],
    ['/uploads/demo.webm', {headers: {'If-None-Match': '*'}}],
  ] satisfies [string, RequestInit][])('защищает video transport %s %j', async (path, options) => {
    const response = await fetch(url + path, options);
    expect(response.status).toBe(401);
  });

  it('отдает ведущему полное видео и byte ranges без публичного кэша', async () => {
    const response = await fetch(url + '/uploads/demo.webm', {headers: {cookie}});
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(readFileSync('assets/demo.webm'));
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const range = await fetch(url + '/uploads/demo.webm', {headers: {cookie, Range: 'bytes=0-15'}});
    expect(range.status).toBe(206);
    expect((await range.arrayBuffer()).byteLength).toBe(16);
    expect(range.headers.get('cache-control')).toContain('no-store');
  });

  it('сохраняет публичные изображения для телефонов гостей', async () => {
    const image = await fetch(url + '/uploads/demo-poster.png');
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
  });

  it('после logout снова закрывает видео и вход проектора', async () => {
    expect((await fetch(url + '/api/logout', {method: 'POST', headers: {cookie}})).status).toBe(200);
    expect((await fetch(url + '/uploads/demo.webm', {headers: {cookie}})).status).toBe(401);
    const socket = await connect(true);
    expect((await ack(socket, 'session:watch', {role: 'screen', sessionId})).ok).toBe(false);
  });
});
