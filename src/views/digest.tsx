import { RETRY_MARK, type Digest } from '../digest/types.js';

const dash = '—';

export function DigestPage({ digest }: { digest: Digest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">
          {digest.badLines} {digest.badLines === 1 ? 'line' : 'lines'} did not parse
        </p>
      )}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((r) => (
              <tr class={r.retries >= RETRY_MARK || r.lastStatus === 'fail' ? 'warn' : undefined}>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="mute">no log for this night</p>
    </>
  );
}
