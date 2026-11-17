// The digest contract (plan.md § 1, issue #1). Types and the reader signature only.
// The reader itself lives in `src/digest/read.ts` (issue #2), which exports
// `readNight: ReadNight`. Page, JSON, board link and route tests build against this file.

/** Status of one run, exactly as written in the log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of `runs/<night>.jsonl`. */
export type RunLine = {
  /** ISO 8601 timestamp with the log's offset, verbatim (e.g. `2026-10-28T23:00:02+01:00`). Never converted to UTC. */
  at: string;
  /** Job name, e.g. `lane/sync`. Non-empty. */
  job: string;
  status: RunStatus;
  /** `null` when the log says `null` (or omits it); the row is kept and shown as `—`. */
  owner: string | null;
  /** Present only when the line carries an `error` string. */
  error?: string;
};

/**
 * One row per job in the night. Lines are taken in file order (the log is append-only);
 * "first" and "last" below mean first and last line for that job in the file, not min/max of `at`.
 */
export type DigestRow = {
  job: string;
  /** Owner of the last line for the job that has a non-null owner; `null` if every line has `null`. */
  owner: string | null;
  /** Number of parsed lines for the job (all statuses). Always >= 1. */
  runs: number;
  /** Number of the job's lines with status `retry`. */
  retries: number;
  /** Status of the job's last line. */
  lastStatus: RunStatus;
  /**
   * `error` of the job's last line that carried one, whatever its status and whatever came
   * after it (a later `ok` does not clear it). `null` if no line for the job had an error.
   */
  lastError: string | null;
  /** `at` of the job's first line, verbatim with the log's offset. */
  firstAt: string;
  /** `at` of the job's last line, verbatim with the log's offset. */
  lastAt: string;
};

/** Per-night counts of parsed lines by status. `ok + retry + fail` equals the sum of `rows[].runs`. */
export type StatusCounts = Record<RunStatus, number>;

/** What `readNight` returns for a night whose file exists. */
export type Digest = {
  /** The night, `YYYY-MM-DD` (the file name without `.jsonl`). */
  night: string;
  /**
   * One row per distinct job, sorted by `job` in plain string order (`a.job < b.job`,
   * UTF-16 code units; not `localeCompare`). Empty when the file has no parsed lines.
   */
  rows: DigestRow[];
  /** Parsed lines (not jobs) per status, across all jobs. Bad lines are not counted here. */
  counts: StatusCounts;
  /**
   * Lines that did not parse: invalid JSON, or JSON that is not an object with a non-empty
   * string `at` and `job`, a `status` in `RunStatus`, `owner` string or null/absent, and
   * `error` (if present) a string. Counted, never thrown. Blank or whitespace-only lines
   * (including the trailing newline) are skipped and are not bad lines.
   */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl` into a `Digest`.
 * - Returns `null` when there is no file for that night, or `night` does not match
 *   `NIGHT_RE` (routes answer 404).
 * - An empty file (or one with only blank/bad lines) returns a `Digest` with `rows: []`
 *   (the page renders "nothing ran").
 * - Synchronous. Bad content never throws; I/O errors other than a missing file propagate.
 * Implemented in `src/digest/read.ts` (issue #2) as `export const readNight: ReadNight`.
 */
export type ReadNight = (runsDir: string, night: string) => Digest | null;

/** A valid night name: `YYYY-MM-DD`. Anything else is treated as "no file". */
export const NIGHT_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A row is marked when `retries >= RETRY_MARK` or `lastStatus === 'fail'`. */
export const RETRY_MARK = 3;
