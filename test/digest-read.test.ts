import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line, exact rows', () => {
    const d = readNight('runs', '2026-10-28');
    expect(d).not.toBeNull();
    if (d === null) return;
    expect(d.night).toBe('2026-10-28');
    expect(d.badLines).toBe(1);
    expect(d.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(d.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
    expect(d.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    const total = d.rows.reduce((n, r) => n + r.runs, 0);
    expect(d.counts.ok + d.counts.retry + d.counts.fail).toBe(total);
  });

  it('reads 2026-10-27: 4 jobs, 0 bad lines', () => {
    const d = readNight('runs', '2026-10-27');
    expect(d?.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(d?.badLines).toBe(0);
    expect(d?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for an invalid night', () => {
    writeFileSync(join(dir, 'latest.jsonl'), '');
    expect(readNight(dir, 'latest')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('returns rows [] for an empty file', () => {
    writeFileSync(join(dir, '2026-02-01.jsonl'), '');
    expect(readNight(dir, '2026-02-01')).toEqual({
      night: '2026-02-01', rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0,
    });
  });

  it('skips blank lines without counting them bad', () => {
    const line = '{"at":"2026-02-02T01:00:00+01:00","job":"a/b","status":"ok","owner":"rook"}';
    writeFileSync(join(dir, '2026-02-02.jsonl'), `\n${line}\n   \n\t\n${line}`);
    const d = readNight(dir, '2026-02-02');
    expect(d?.badLines).toBe(0);
    expect(d?.rows).toHaveLength(1);
    expect(d?.rows[0]?.runs).toBe(2);
  });

  it('counts wrong-shaped lines as bad and keeps an omitted owner as null', () => {
    const lines = [
      '[1,2]',
      '"text"',
      '{"at":"","job":"x","status":"ok","owner":null}',
      '{"at":"t","job":"x","status":"done","owner":null}',
      '{"at":"t","job":"x","status":"ok","owner":7}',
      '{"at":"t","job":"x","status":"ok","owner":null,"error":5}',
      '{"at":"2026-02-03T01:00:00+01:00","job":"x","status":"ok"}',
    ];
    writeFileSync(join(dir, '2026-02-03.jsonl'), lines.join('\n') + '\n');
    const d = readNight(dir, '2026-02-03');
    expect(d?.badLines).toBe(6);
    expect(d?.rows).toEqual([
      {
        job: 'x', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-02-03T01:00:00+01:00', lastAt: '2026-02-03T01:00:00+01:00',
      },
    ]);
  });
});
