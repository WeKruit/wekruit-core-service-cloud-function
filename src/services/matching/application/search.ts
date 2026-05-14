const TOKEN_PATTERN = /[^a-z0-9]+/g;

export function buildSearchTokens(...inputs: Array<string | null | undefined>) {
  const tokens = new Set<string>();

  for (const input of inputs) {
    if (!input) {
      continue;
    }

    for (const token of input.toLowerCase().split(TOKEN_PATTERN)) {
      if (token.length >= 2) {
        tokens.add(token);
      }
    }
  }

  return [...tokens];
}
