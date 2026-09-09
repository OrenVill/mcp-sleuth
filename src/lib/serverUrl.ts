/**
 * URL questions the server form asks. Here rather than in the component so the
 * rules are testable and the component stays a renderer.
 */

/**
 * True when this endpoint is reached over TLS.
 *
 * Drives whether the self-signed certificate option is offered at all: over
 * plain HTTP there is no certificate to waive. Deliberately tolerant — a
 * half-typed URL is not an error the user needs told about, it just is not
 * https yet.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}
