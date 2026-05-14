/**
 * BrightData LinkedIn enrichment integration.
 *
 * Single dataset wired: `gd_l1viktl72bvl7bjuj0` (LinkedIn profile-by-URL).
 * Sync mode (BrightData blocks until snapshot is ready, default cap ~3 min).
 *
 * Auth: `BRIGHT_DATA_API_KEY` env / Firebase secret. When unset, every helper
 * throws a `BrightDataKeyMissingError` so the HTTP route can answer 503
 * `{ error: { code: 'bright_data_key_missing' } }` without a 500 stack trace.
 *
 * No mock fallback: we want the dashboard to surface "key not configured" so
 * the operator knows the unblock step (Adam: rotate + secret-set).
 */

const DEFAULT_DATASET_ID = 'gd_l1viktl72bvl7bjuj0';
const DEFAULT_BASE = 'https://api.brightdata.com';
const SYNC_TIMEOUT_MS = 90_000;

export class BrightDataKeyMissingError extends Error {
  readonly code = 'bright_data_key_missing';
  constructor() {
    super('BRIGHT_DATA_API_KEY secret is not configured');
  }
}

export class BrightDataHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`BrightData HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export interface BrightDataLinkedInProfile {
  /** Raw JSON object returned by the BrightData dataset row. Shape is dataset-defined. */
  raw: Record<string, unknown>;
  /** Profile URL the row was keyed on. */
  url: string;
}

export interface BrightDataTriggerResult {
  snapshotId: string;
  status: 'building' | 'ready' | 'failed';
  rows: BrightDataLinkedInProfile[];
}

export interface BrightDataClientDeps {
  /** Override for tests. */
  fetcher?: typeof fetch;
  /** Override for tests / staging. */
  baseUrl?: string;
  /** Override for tests. */
  apiKey?: string;
  /** Dataset id; defaults to LinkedIn-profile-by-URL. */
  datasetId?: string;
}

function readApiKey(override?: string): string {
  const key = override ?? process.env.BRIGHT_DATA_API_KEY;
  const trimmed = (key ?? '').trim();
  // Empty / placeholder values are treated as missing so the dashboard can
  // surface "key not configured" instead of forwarding a doomed call to
  // BrightData. Adam rotates the leaked key + `firebase functions:secrets:set
  // BRIGHT_DATA_API_KEY` to unblock.
  if (!trimmed) throw new BrightDataKeyMissingError();
  if (/^pending[_-]/i.test(trimmed) || /^placeholder/i.test(trimmed)) {
    throw new BrightDataKeyMissingError();
  }
  return trimmed;
}

/**
 * Trigger BrightData sync collect for one or more LinkedIn URLs and wait for
 * the snapshot to materialize. Returns parsed rows.
 *
 * Single-call sync flow (avoids client-side polling):
 *   POST /datasets/v3/trigger?dataset_id=<id>&include_errors=true&sync=true
 *
 * BrightData accepts a JSON array `[{"url": "..."}]`. The response body is
 * the snapshot rows directly when `sync=true` succeeds within the platform
 * timeout. We still allow the async path (snapshot_id returned + 202) so
 * the caller can poll later if the sync window times out.
 */
export async function triggerLinkedInLookup(
  urls: string[],
  deps: BrightDataClientDeps = {},
): Promise<BrightDataTriggerResult> {
  if (urls.length === 0) {
    return { snapshotId: '', status: 'ready', rows: [] };
  }
  const apiKey = readApiKey(deps.apiKey);
  const datasetId = deps.datasetId ?? DEFAULT_DATASET_ID;
  const baseUrl = deps.baseUrl ?? DEFAULT_BASE;
  const fetcher = deps.fetcher ?? fetch;

  const triggerUrl =
    `${baseUrl}/datasets/v3/trigger?dataset_id=${encodeURIComponent(datasetId)}` +
    `&include_errors=true&sync=true`;
  const body = JSON.stringify(urls.map((url) => ({ url })));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const res = await fetcher(triggerUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BrightDataHttpError(res.status, text);
    }
    return parseTriggerResponse(text, urls);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the trigger response. BrightData returns either:
 *   - `{ snapshot_id: "..." }` (202, sync timed out — caller polls)
 *   - `[{...row}, {...row}]` (200, sync completed)
 *   - `{ snapshot_id: "...", data: [...] }` (some variants)
 */
function parseTriggerResponse(text: string, urls: string[]): BrightDataTriggerResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { snapshotId: '', status: 'failed', rows: [] };
  }
  // Array shape — direct rows.
  if (Array.isArray(json)) {
    return {
      snapshotId: '',
      status: 'ready',
      rows: json.map((row, i) => ({
        raw: (row ?? {}) as Record<string, unknown>,
        url: urls[i] ?? '',
      })),
    };
  }
  if (json && typeof json === 'object') {
    const obj = json as { snapshot_id?: string; data?: unknown };
    const snapshotId = obj.snapshot_id ?? '';
    if (Array.isArray(obj.data)) {
      return {
        snapshotId,
        status: 'ready',
        rows: obj.data.map((row, i) => ({
          raw: (row ?? {}) as Record<string, unknown>,
          url: urls[i] ?? '',
        })),
      };
    }
    return { snapshotId, status: 'building', rows: [] };
  }
  return { snapshotId: '', status: 'failed', rows: [] };
}

/**
 * Fetch a snapshot result by id (for the async/polling path).
 */
export async function fetchSnapshot(
  snapshotId: string,
  urls: string[],
  deps: BrightDataClientDeps = {},
): Promise<BrightDataTriggerResult> {
  if (!snapshotId) return { snapshotId, status: 'failed', rows: [] };
  const apiKey = readApiKey(deps.apiKey);
  const baseUrl = deps.baseUrl ?? DEFAULT_BASE;
  const fetcher = deps.fetcher ?? fetch;
  const url = `${baseUrl}/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`;
  const res = await fetcher(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  if (res.status === 202) {
    return { snapshotId, status: 'building', rows: [] };
  }
  if (!res.ok) {
    throw new BrightDataHttpError(res.status, text);
  }
  return parseTriggerResponse(text, urls);
}

export function isLikelyLinkedInUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub|company)\//i.test(value);
}
