/**
 * GitHub public-profile enrichment integration.
 *
 * Uses the unauthenticated GitHub REST API
 * (`https://api.github.com/users/{username}`), no API key needed. Rate limit
 * is 60 req/hr per IP for unauthenticated callers — sufficient for the
 * operator-triggered enrich button flow we expose today.
 *
 * If we later need higher throughput (e.g. nightly batch enrich on every new
 * source-record), wire `GITHUB_API_TOKEN` (Firebase secret) for 5000 req/hr.
 */

const DEFAULT_BASE = 'https://api.github.com';

export class GitHubKeyOptionalMissingError extends Error {
  readonly code = 'github_unauth_only';
}

export class GitHubHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`GitHub HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export interface GitHubPublicProfile {
  login: string;
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  email?: string | null;
  bio?: string | null;
  twitter_username?: string | null;
  public_repos?: number;
  followers?: number;
  following?: number;
  html_url: string;
  hireable?: boolean | null;
  created_at?: string;
}

export interface GitHubLookupResult {
  status: 'ready' | 'failed';
  profile: GitHubPublicProfile | null;
  username: string;
  rateLimit?: { remaining: number; reset: number };
}

const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?)\/?$/;

export function isLikelyGitHubUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return GITHUB_URL_RE.test(value.trim());
}

export function extractGitHubUsername(value: string): string | null {
  const m = GITHUB_URL_RE.exec(value.trim());
  return m ? m[1]! : null;
}

export interface GitHubClientDeps {
  fetcher?: typeof fetch;
  baseUrl?: string;
  apiToken?: string;
}

export async function fetchGitHubProfile(
  username: string,
  deps: GitHubClientDeps = {},
): Promise<GitHubLookupResult> {
  const baseUrl = deps.baseUrl ?? DEFAULT_BASE;
  const fetcher = deps.fetcher ?? fetch;
  const token = deps.apiToken ?? process.env.GITHUB_API_TOKEN;

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'wekruit-sourcing-service/1.0',
  };
  if (token && token.trim()) headers.authorization = `Bearer ${token.trim()}`;

  const res = await fetcher(`${baseUrl}/users/${encodeURIComponent(username)}`, { headers });

  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  const rateLimit = Number.isFinite(remaining) && Number.isFinite(reset)
    ? { remaining, reset }
    : undefined;

  if (res.status === 404) {
    return { status: 'failed', profile: null, username, rateLimit };
  }
  const text = await res.text();
  if (!res.ok) {
    throw new GitHubHttpError(res.status, text);
  }
  const profile = JSON.parse(text) as GitHubPublicProfile;
  return { status: 'ready', profile, username, rateLimit };
}
