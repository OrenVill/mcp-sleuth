/**
 * Serves the built renderer over a custom `app://` scheme.
 *
 * A custom standard scheme is used rather than `file://` because the renderer
 * needs a stable origin: the vault stores its envelope in IndexedDB and the
 * server list uses localStorage, both of which behave unpredictably on an
 * opaque `file://` origin.
 */
import { extname, join, resolve, sep } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = 'app://mcp-sleuth';

/**
 * True if any path segment of `value` is a `..` traversal step.
 *
 * The WHATWG URL parser silently collapses `..` segments, so by the time we read
 * `url.pathname` a traversal attempt already looks like an innocent absolute
 * path. The raw request string is inspected instead, so the request is refused
 * rather than quietly rewritten.
 */
function hasTraversalSegment(value) {
  return value.split(/[/\\]/).includes('..');
}

/**
 * Map an `app://` URL to an absolute path inside `root`, or null if the request
 * escapes the root. Extensionless paths fall back to index.html for SPA routing.
 */
export function resolveAppPath(requestUrl, root) {
  let raw;
  let pathname;
  try {
    raw = decodeURIComponent(requestUrl);
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }

  if (hasTraversalSegment(raw) || hasTraversalSegment(pathname)) return null;

  const rootResolved = resolve(root);
  const candidate = resolve(join(rootResolved, pathname));

  if (candidate !== rootResolved && !candidate.startsWith(rootResolved + sep)) {
    return null;
  }

  if (pathname === '/' || pathname === '') return join(rootResolved, 'index.html');
  if (!extname(pathname)) return join(rootResolved, 'index.html');

  return candidate;
}
