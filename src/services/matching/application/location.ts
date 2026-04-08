export const LOCATION_ALIASES: Record<string, string> = {
  sf: 'san francisco',
  'san francisco': 'san francisco',
  'san francisco, ca': 'san francisco',
  'sf, ca': 'san francisco',
  nyc: 'new york',
  'new york': 'new york',
  'new york, ny': 'new york',
  ny: 'new york',
  la: 'los angeles',
  'los angeles': 'los angeles',
  'los angeles, ca': 'los angeles',
  seattle: 'seattle',
  'seattle, wa': 'seattle',
  austin: 'austin',
  'austin, tx': 'austin',
  boston: 'boston',
  'boston, ma': 'boston',
  chicago: 'chicago',
  'chicago, il': 'chicago',
  remote: 'remote',
};

export function normalizeLocation(location: string) {
  const normalized = location.trim().toLowerCase();
  return LOCATION_ALIASES[normalized] ?? normalized;
}

export function getLocationBuckets(locationRaw: string | null | undefined) {
  if (!locationRaw) {
    return [];
  }

  const tokens = locationRaw
    .split(';')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean);

  const buckets = new Set<string>();
  for (const token of tokens) {
    const normalized = normalizeLocation(token);
    if (normalized === 'remote') {
      return ['remote'];
    }
    buckets.add(normalized);
  }

  return [...buckets];
}
