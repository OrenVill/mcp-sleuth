/**
 * Which provider URLs Agent Chat is allowed to reach.
 *
 * Shared by both builds on purpose. The browser build posts through
 * `llm-proxy.js`, which has always constrained the request to a named provider
 * and the paths that provider exposes. The desktop build fetches from the main
 * process instead, and used to take whatever URL and headers the renderer sent
 * — the same relay, with none of the constraints. One list, applied in both
 * places, so the two builds cannot drift apart again.
 *
 * The host is deliberately unconstrained: Ollama, LM Studio, vLLM and every
 * other self-hosted OpenAI-compatible server lives on an arbitrary host. The
 * path is what keeps this a forwarder rather than a general-purpose relay.
 */
export const ALLOWED_PATHS = {
  openai: [/\/chat\/completions$/, /\/models$/],
  anthropic: [/\/messages$/, /\/models$/],
  gemini: [/:generateContent$/, /:streamGenerateContent$/, /\/models$/],
};

export function isKnownProvider(provider) {
  return Object.prototype.hasOwnProperty.call(ALLOWED_PATHS, provider);
}

export function isAllowedTarget(provider, targetUrl) {
  const patterns = ALLOWED_PATHS[provider];
  if (!patterns) return false;
  return patterns.some((pattern) => pattern.test(targetUrl.pathname));
}

/**
 * Parse and check a provider URL in one step.
 *
 * Returns the parsed URL, or throws with a message safe to show a user. Only
 * http and https: a `file:` target would make the fetch a file read.
 */
export function requireAllowedTarget(provider, url) {
  if (!isKnownProvider(provider)) {
    throw new Error(`"${provider}" is not a recognised model provider`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid provider URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https provider URLs are supported');
  }
  if (!isAllowedTarget(provider, parsed)) {
    throw new Error(`That path is not one the ${provider} provider exposes`);
  }
  return parsed;
}
