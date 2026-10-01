import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from '../apps/server/src/engine.js';
import {openStore} from '../apps/server/src/db.js';
import {newQuestion, newQuiz, quizSchema} from '../packages/shared/src/index.js';

const fixtures: {store: ReturnType<typeof openStore>; dir: string}[] = [];
afterEach(() => {
  for (const {store, dir} of fixtures.splice(0)) {
    store.sqlite.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
async function game(twoRounds = false) {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-regression-'));
  const store = openStore(dir);
  fixtures.push({store, dir});
  const quiz = newQuiz();
  quiz.rounds[0].questions[0].speedBonus = false;
  if (twoRounds) quiz.rounds.push({id: crypto.randomUUID(), title: 'Финал', questions: [{...newQuestion(), points: 2000, speedBonus: false}]});
  const engine = new Engine(store, 'http://localhost:3000');
  const session = await engine.create(quiz);
  const act = (action: Parameters<Engine['action']>[0]['action'], participantId?: string) => engine.action({sessionId: session.id, action, participantId}, 1000);
  return {engine, store, quiz, session, act};
}

describe('Регрессии рабочего игрового движка', () => {
  it('реальный движок проходит весь раунд и финал', async () => {
    const {session, act} = await game();
    for (const phase of ['ROUND_INTRO', 'QUESTION_OPEN', 'QUESTION_LOCKED', 'ANSWER_REVEAL', 'ROUND_LEADERBOARD', 'FINISHED']) {
      act('next');
      expect(session.phase).toBe(phase);
    }
    expect(() => act('next')).toThrow('Игра завершена');
  });
  it('отклоняет повторный next для уже изменившегося состояния', async () => {
    const {engine, session, act} = await game();
    act('next');
    const command = {sessionId: session.id, action: 'next' as const, expectedRevision: session.revision};
    engine.action(command, 1000);
    expect(session.phase).toBe('QUESTION_OPEN');
    expect(() => engine.action(command, 1001)).toThrow();
    expect(session.phase).toBe('QUESTION_OPEN');
  });

  it('исключает удаленного игрока из live-статистики, сохраняя историю ответов', async () => {
    const {engine, store, quiz, session, act} = await game();
    const a = engine.join(session.code, 'Первый'), b = engine.join(session.code, 'Второй');
    act('next'); act('next');
    const q = quiz.rounds[0].questions[0];
    engine.submit(session.id, a.id, q.id, q.correct, 1500);
    engine.submit(session.id, b.id, q.id, q.correct, 1500);
    act('lock'); act('kick', b.id);
    const state = engine.snapshot(session.id, 'host');
    expect(state.answerCount).toBe(1);
    expect(state.participantCount).toBe(1);
    expect(state.stats![q.correct[0]]).toBe(1);
    expect(store.answers(session.id)).toHaveLength(2);
  });

  it('сохраняет изменение места последнего раунда в финале', async () => {
    const {engine, quiz, session, act} = await game(true);
    const a = engine.join(session.code, 'Алиса'), b = engine.join(session.code, 'Борис');
    act('next'); act('next');
    const first = quiz.rounds[0].questions[0];
    engine.submit(session.id, a.id, first.id, first.correct, 1500);
    engine.submit(session.id, b.id, first.id, [first.options[1].id], 1500);
    act('lock'); act('reveal'); act('next'); act('next'); act('next');
    const second = quiz.rounds[1].questions[0];
    engine.submit(session.id, a.id, second.id, [second.options[1].id], 1500);
    engine.submit(session.id, b.id, second.id, second.correct, 1500);
    act('lock'); act('reveal'); act('next');
    const before = engine.snapshot(session.id, 'player', b.id);
    expect(before.leaderboard.map(p => [p.nickname, p.delta])).toEqual([['Борис', 1], ['Алиса', -1]]);
    act('next');
    const final = engine.snapshot(session.id, 'player', b.id);
    expect(final.phase).toBe('FINISHED');
    expect(final.leaderboard.map(p => [p.nickname, p.delta])).toEqual([['Борис', 1], ['Алиса', -1]]);
  });

  it('валидирует уникальные правильные варианты multiple', () => {
    const quiz = newQuiz(), q = quiz.rounds[0].questions[0];
    q.type = 'multiple'; q.correct = [q.options[0].id, q.options[0].id];
    expect(quizSchema.safeParse(quiz).success).toBe(false);
    q.correct = q.options.map(o => o.id);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
  });
});
