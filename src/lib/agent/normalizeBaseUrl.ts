/** Trim whitespace and remove trailing slashes from an LLM server base URL. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Append a path segment to a base URL without producing `//` in the path. */
export function joinBaseUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
