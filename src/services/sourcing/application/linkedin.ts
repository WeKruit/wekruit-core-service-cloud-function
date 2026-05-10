const linkedInUrlRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi;

function withUrlScheme(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(www\.)?linkedin\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function cleanLinkedInToken(input: string): string {
  return input.trim().replace(/[),.;\]]+$/g, '');
}

export function normalizeLinkedInProfileUrl(input: string): string | null {
  try {
    const url = new URL(withUrlScheme(cleanLinkedInToken(input)));
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'linkedin.com') {
      return null;
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length !== 2 || pathParts[0]?.toLowerCase() !== 'in') {
      return null;
    }

    const slug = pathParts[1]?.trim().toLowerCase();
    if (!slug || !/^[a-z0-9][a-z0-9._%-]*$/.test(slug)) {
      return null;
    }

    return `https://www.linkedin.com/in/${slug}`;
  } catch {
    return null;
  }
}

export function isLinkedInProfileUrl(input: string): boolean {
  return normalizeLinkedInProfileUrl(input) !== null;
}

export function extractLinkedInProfileUrls(input: string): string[] {
  const urls = input.match(linkedInUrlRegex) ?? [];
  return [...new Set(urls.map((url) => normalizeLinkedInProfileUrl(url)).filter((url): url is string => Boolean(url)))]
    .sort((left, right) => left.localeCompare(right));
}
