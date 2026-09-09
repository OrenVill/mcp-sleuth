/**
 * The Content-Security-Policy served with the app's own HTML.
 *
 * Sleuth renders names, descriptions, markdown and whole HTML resources that
 * come from the MCP server under investigation, which is the thing being
 * distrusted. The markdown renderer escapes raw HTML and allowlists URL schemes,
 * and the HTML resource preview runs in a fully sandboxed frame, but neither
 * should be the only thing standing between a hostile server and script
 * execution in the app's origin. This is the backstop.
 *
 * Sent as a response header rather than a `<meta>` tag on purpose: the same
 * `index.html` is served by the Vite dev server, whose HMR client needs inline
 * and eval'd script that production does not. A header lets the built app be
 * strict without making `npm run dev` unusable.
 *
 * Two directives are deliberately loose:
 *
 * - `style-src` allows inline styles. React sets element styles directly and the
 *   syntax highlighter emits inline colours; there is no XSS sink here that the
 *   markdown escaping does not already close.
 * - `connect-src` allows any http(s) host. That is the product: an unproxied
 *   browser connection goes straight to whatever MCP endpoint the user added,
 *   and Agent Chat talks to whatever provider they configured.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Header pair, for a plain `writeHead` object or Electron's header map. */
export const CSP_HEADER_NAME = 'Content-Security-Policy';
