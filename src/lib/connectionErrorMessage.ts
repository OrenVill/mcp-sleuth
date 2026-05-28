import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function join(title: string, detail: string): string {
  return `${title}\n\n${detail}`;
}

/** Human-readable connection failure for MCP HTTP / Streamable HTTP transport. */
export function formatConnectionError(err: unknown): string {
  if (err instanceof UnauthorizedError) {
    return join(
      'Authentication failed',
      'The server rejected your credentials. Check the token, API key, or Basic auth in Edit server. If the server uses OAuth only, this browser build cannot complete that flow yet — use an access token or another auth method the server accepts.',
    );
  }

  if (err instanceof StreamableHTTPError) {
    return formatStreamableHttp(err);
  }

  if (err instanceof TypeError) {
    const m = err.message || '';
    if (/fetch|network|failed to fetch/i.test(m)) {
      return join(
        'Network error',
        'The browser could not complete the request to the MCP proxy. Check that this app is running (dev server or `npm start`), that you are online, and that nothing blocks localhost traffic.',
      );
    }
    return join('Request failed', m || String(err));
  }

  if (err instanceof Error) {
    return formatGenericMessage(err.message);
  }

  return join('Connection failed', String(err));
}

function formatStreamableHttp(err: StreamableHTTPError): string {
  const code = err.code;
  const raw = err.message.replace(/^Streamable HTTP error:\s*/i, '').trim();

  switch (code) {
    case 400:
      return join(
        'Bad request (HTTP 400)',
        'The server did not accept the request body or headers. Confirm the URL points to the MCP Streamable HTTP endpoint (path and query string), not the wrong route.',
      );
    case 401:
      return join(
        'Unauthorized (HTTP 401)',
        'Authentication failed or is missing. Edit the server and set Bearer token, API key, or Basic credentials if the endpoint requires them.',
      );
    case 403:
      return join(
        'Forbidden (HTTP 403)',
        'The server refused access with your current credentials or IP. Verify permissions and auth settings.',
      );
    case 404:
      return join(
        'Not found (HTTP 404)',
        'Nothing is served at this URL path. Check that the MCP HTTP URL includes the correct path (for example `/mcp` or whatever your server exposes).',
      );
    case 405:
      return join(
        'Method not allowed (HTTP 405)',
        'The endpoint does not allow the HTTP methods MCP needs (POST/SSE). You may have pointed at a REST URL instead of the MCP Streamable HTTP endpoint.',
      );
    case 408:
      return join(
        'Request timeout (HTTP 408)',
        'The server took too long to respond. Retry or increase timeouts on the MCP server.',
      );
    case 429:
      return join(
        'Too many requests (HTTP 429)',
        'The server is rate-limiting you. Wait and try again.',
      );
    case 500:
      return join(
        'Server error (HTTP 500)',
        `The MCP server hit an internal error while handling the request.${raw ? ` Detail: ${raw}` : ''}`,
      );
    case 502:
      return formatBadGateway(raw);
    case 503:
      return join(
        'Service unavailable (HTTP 503)',
        'The MCP server is temporarily overloaded or down for maintenance. Try again shortly.',
      );
    case 504:
      return join(
        'Gateway timeout (HTTP 504)',
        'An upstream proxy or the MCP server did not respond in time.',
      );
    case -1:
      return join(
        'Unexpected response format',
        raw ||
          'The response was not valid MCP Streamable HTTP (wrong Content-Type or body). Confirm the URL is the MCP endpoint your server documents.',
      );
    default:
      if (code !== undefined && code >= 400) {
        return join(`HTTP ${code}`, raw || 'The MCP HTTP transport reported an error from the server.');
      }
      return join('MCP HTTP error', raw || err.message);
  }
}

function formatBadGateway(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('econnrefused')) {
    return join(
      'Cannot reach server (connection refused)',
      'Nothing is accepting connections at that host and port. Start the MCP server, confirm the URL and port, and that it listens on the interface you use (for example 127.0.0.1 vs localhost).',
    );
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return join(
      'Host not found (DNS)',
      'The hostname in the URL could not be resolved. Check spelling and DNS/VPN.',
    );
  }
  if (lower.includes('etimedout') || lower.includes('timeout')) {
    return join(
      'Upstream timed out',
      'The MCP proxy reached the target but it did not respond in time. The server may be down, firewalled, or too slow.',
    );
  }
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return join(
      'TLS / certificate problem',
      'HTTPS to the upstream failed certificate validation. Use a trusted URL or fix the server certificate.',
    );
  }
  return join(
    'Bad gateway (HTTP 502)',
    raw
      ? `The local MCP proxy could not get a valid response from the target server. ${raw}`
      : 'The local MCP proxy could not get a valid response — often the upstream is unreachable, refused the connection, or closed TLS incorrectly.',
  );
}

function formatGenericMessage(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('stdio requires the local explorer')) {
    return join(
      'Stdio requires the local explorer server',
      'Run npm run dev or mcp-explorer instead of opening dist/index.html directly.',
    );
  }

  if (/\bspawn\b[\s\S]*\benoent\b/i.test(message) || /\benoent\b[\s\S]*\bspawn\b/i.test(message)) {
    const cmdMatch = message.match(/spawn\s+(\S+)\s+enoent/i);
    const cmd = cmdMatch?.[1];
    return join(
      'Could not start process',
      cmd
        ? `The command "${cmd}" was not found on your PATH. Check the command and working directory in Edit server.`
        : 'The configured command was not found. Check the command path and that it is installed on your system.',
    );
  }

  if (lower.includes('bad gateway:')) {
    const tail = message.replace(/^[\s\S]*?bad gateway:\s*/i, '').trim();
    return formatBadGateway(tail || message);
  }

  if (lower.includes('econnrefused')) {
    return join(
      'Connection refused',
      'No program is listening at that address. Verify the MCP server is running and the port in the URL matches.',
    );
  }
  if (lower.includes('enotfound')) {
    return join('Host lookup failed', 'Check the hostname in the MCP URL.');
  }
  if (lower.includes('etimedout') || lower.includes('timeout')) {
    return join('Connection timed out', 'The server did not answer in time — it may be overloaded or blocked.');
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return join(
      'Network error',
      'Could not reach the MCP proxy or the connection was interrupted. Confirm the app URL and try again.',
    );
  }

  return join('Connection failed', message);
}
