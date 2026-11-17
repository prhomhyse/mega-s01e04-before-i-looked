import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Digest } from '../src/digest/types.js';

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-10-25';

const line = (o: Record<string, unknown>) => JSON.stringify(o);
const normalLines = [
  line({ at: '2026-10-28T23:00:02+01:00', job: 'zeta/last', status: 'ok', owner: 'ada' }),
  line({ at: '2026-10-28T23:05:00+01:00', job: 'alpha/flaky', status: 'retry', owner: 'bob' }),
  line({ at: '2026-10-28T23:06:00+01:00', job: 'alpha/flaky', status: 'retry', owner: 'bob' }),
  line({ at: '2026-10-28T23:07:00+01:00', job: 'alpha/flaky', status: 'retry', owner: 'bob' }),
  line({ at: '2026-10-28T23:08:00+01:00', job: 'alpha/flaky', status: 'ok', owner: 'bob' }),
  line({ at: '2026-10-28T23:10:00+01:00', job: 'mid/broken', status: 'fail', owner: 'cy', error: 'boom' }),
  line({ at: '2026-10-28T23:12:00+01:00', job: 'mid/orphan', status: 'ok', owner: null }),
  line({ at: '2026-10-28T23:15:00+01:00', job: 'mid/fine', status: 'ok', owner: 'dee' }),
];

let dir: string;
const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    [
      line({ at: '2026-10-26T23:00:00+01:00', job: 'good/one', status: 'ok', owner: 'ada' }),
      '{not json',
      line({ at: '2026-10-26T23:01:00+01:00', job: 'good/two', status: 'ok', owner: 'ada' }),
    ].join('\n') + '\n',
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The `<tr ...>` opening tag plus content of the row that mentions `job`. */
function rowOf(html: string, job: string): { open: string; all: string } {
  const at = html.indexOf(job);
  if (at < 0) throw new Error(`${job} not in page`);
  const start = html.lastIndexOf('<tr', at);
  if (start < 0) throw new Error(`no <tr> before ${job}`);
  const end = html.indexOf('</tr>', at);
  const all = html.slice(start, end < 0 ? undefined : end);
  return { open: all.slice(0, all.indexOf('>') + 1), all };
}

describe('GET /digest/:night', () => {
  it('200 for a normal night, with the lane banner and a table', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app().request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<table');
    for (const job of ['alpha/flaky', 'mid/broken', 'mid/fine', 'mid/orphan', 'zeta/last']) {
      expect(html).toContain(job);
    }
  });

  it('404 for a night with no file', async () => {
    expect((await app().request(`/digest/${MISSING}`)).status).toBe(404);
  });

  it('404 for a malformed night', async () => {
    expect((await app().request('/digest/not-a-night')).status).toBe(404);
  });

  it('empty night says nothing ran', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a night with a bad line still renders the good rows', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('good/one');
    expect(html).toContain('good/two');
  });

  it('marks retries >= 3 and fails with class warn, and only those', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'alpha/flaky').open).toMatch(/class="[^"]*\bwarn\b/);
    expect(rowOf(html, 'mid/broken').open).toMatch(/class="[^"]*\bwarn\b/);
    expect(rowOf(html, 'mid/fine').open).not.toContain('warn');
    expect(rowOf(html, 'zeta/last').open).not.toContain('warn');
  });

  it('shows a dash for a null owner', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'mid/orphan').all).toContain('—');
  });

  it('keeps the +01:00 offset on timestamps', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('2026-10-28T23:00:02+01:00');
    expect(html).not.toContain('2026-10-28T22:00:02');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the Digest object for a normal night', async () => {
    const res = await app().request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const d = (await res.json()) as Digest;
    expect(d.night).toBe(NORMAL);
    expect(d.badLines).toBe(0);
    expect(d.counts).toEqual({ ok: 4, retry: 3, fail: 1 });
    expect(d.rows.map((r) => r.job)).toEqual(['alpha/flaky', 'mid/broken', 'mid/fine', 'mid/orphan', 'zeta/last']);
    expect(d.rows.find((r) => r.job === 'mid/orphan')?.owner).toBeNull();
    expect(d.rows.find((r) => r.job === 'zeta/last')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });

  it('404 with a JSON body for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(typeof (await res.json())).toBe('object');
  });

  it('empty night has rows []', async () => {
    const res = await app().request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const d = (await res.json()) as Digest;
    expect(d.rows).toEqual([]);
    expect(d.badLines).toBe(0);
  });

  it('a night with a bad line is 200, badLines 1, good rows present', async () => {
    const res = await app().request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const d = (await res.json()) as Digest;
    expect(d.badLines).toBe(1);
    expect(d.rows.map((r) => r.job)).toEqual(['good/one', 'good/two']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    const d = (await (await app().request(`/api/digest/${NORMAL}`)).json()) as Digest;
    const jsonJobs = d.rows.map((r) => r.job);
    const inPage = jsonJobs.map((job) => ({ job, at: html.indexOf(job) })).sort((a, b) => a.at - b.at);
    expect(inPage.every((p) => p.at >= 0)).toBe(true);
    expect(inPage.map((p) => p.job)).toEqual(jsonJobs);
  });
});
