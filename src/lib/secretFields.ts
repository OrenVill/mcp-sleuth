import type { ServerAuth } from '../types';

/**
 * Keeping a stored credential out of the edit form.
 *
 * `type="password"` is a display convention, not a boundary. A prefilled
 * masked field still holds the plaintext, readable from devtools, a browser
 * extension, the X11 primary selection, a password manager, and — depending on
 * the browser — an ordinary copy. The only reliable fix is to never hand the
 * secret to the renderer in the first place.
 *
 * So an edit form receives a marker instead of the credential, shows
 * {@link SECRET_MASK} in its place, and submits the marker back untouched when
 * the user leaves the field alone. The caller resolves the marker against what
 * is actually stored. Nothing in between ever sees the plaintext.
 */

/**
 * What a form shows in place of a secret it never received. Five characters,
 * so copying the field out yields exactly this and not a credential.
 */
export const SECRET_MASK = '*****';

/**
 * Prefix of the value meaning “whatever is already stored stays”. It opens with
 * a NUL, so no keyboard can produce it and no real credential collides with it.
 */
const KEEP_PREFIX = `${String.fromCharCode(0)}mcp-sleuth:keep-stored-secret`;

/**
 * The marker for a kept secret. `storedKey` names the entry it came from, so a
 * renamed environment row still resolves against the right stored value.
 */
export function keepMarker(storedKey?: string): string {
  return storedKey ? `${KEEP_PREFIX}:${storedKey}` : KEEP_PREFIX;
}

export function isKeptSecret(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(KEEP_PREFIX);
}

/** The stored key a marker names, or `''` when it names none. */
function markerKey(value: string): string {
  return value.slice(KEEP_PREFIX.length + 1);
}

/** A marker for a secret that is actually stored; empty stays empty. */
export function maskStoredSecret(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? keepMarker() : '';
}

/** Resolve one submitted field: a marker means “keep `stored`”. */
export function resolveStoredSecret(
  submitted: string | undefined,
  stored: string | undefined,
): string | undefined {
  if (submitted === undefined) return undefined;
  if (!isKeptSecret(submitted)) return submitted;
  return stored ?? '';
}

/** The auth to hand an edit form: every secret replaced by a marker. */
export function maskAuthSecrets(auth: ServerAuth | undefined): ServerAuth | undefined {
  if (!auth) return undefined;
  switch (auth.method) {
    case 'bearer':
      return { ...auth, bearerToken: maskStoredSecret(auth.bearerToken) };
    case 'api_key':
      return { ...auth, apiKeyValue: maskStoredSecret(auth.apiKeyValue) };
    case 'basic':
      return { ...auth, basicPassword: maskStoredSecret(auth.basicPassword) };
    default:
      return auth;
  }
}

/**
 * The auth to store: every marker replaced by what is already stored. A marker
 * only resolves against the same auth method, so switching method can never
 * carry one method's credential into another's field.
 */
export function resolveAuthSecrets(
  submitted: ServerAuth | undefined,
  stored: ServerAuth | undefined,
): ServerAuth | undefined {
  if (!submitted) return undefined;
  const sameMethod = stored?.method === submitted.method ? stored : undefined;
  switch (submitted.method) {
    case 'bearer':
      return { ...submitted, bearerToken: resolveStoredSecret(submitted.bearerToken, sameMethod?.bearerToken) };
    case 'api_key':
      return { ...submitted, apiKeyValue: resolveStoredSecret(submitted.apiKeyValue, sameMethod?.apiKeyValue) };
    case 'basic':
      return {
        ...submitted,
        basicPassword: resolveStoredSecret(submitted.basicPassword, sameMethod?.basicPassword),
      };
    default:
      return submitted;
  }
}

/** Stdio environment values to store, with every marker resolved. */
export function resolveEnvSecrets(
  submitted: Record<string, string> | undefined,
  stored: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!submitted) return undefined;
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(submitted)) {
    resolved[key] = isKeptSecret(value) ? (stored?.[markerKey(value) || key] ?? '') : value;
  }
  return resolved;
}
