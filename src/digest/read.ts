// Run log reader (plan.md § 1, issue #2). Contract: `src/digest/types.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIGHT_RE } from './types.js';
import type { DigestRow, ReadNight, RunLine, RunStatus, StatusCounts } from './types.js';

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

const isStatus = (v: unknown): v is RunStatus => typeof v === 'string' && STATUSES.includes(v);

/** Parse one log line; `null` when it does not match the `RunLine` shape. */
const parseLine = (text: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || o.at === '') return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (!isStatus(o.status)) return null;
  if (o.owner !== undefined && o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const line: RunLine = { at: o.at, job: o.job, status: o.status, owner: o.owner ?? null };
  if (typeof o.error === 'string') line.error = o.error;
  return line;
};

/** File contents, or `null` when the file does not exist. Other I/O errors propagate. */
const readFileOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT_RE.test(night)) return null;
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    if (line.owner !== null) row.owner = line.owner;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastStatus = line.status;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, counts, badLines };
};
