import type { JsonSchema } from '../types';

/** JSON Schema from an elicitation/create request, when the server uses form mode. */
export function elicitationRequestedSchema(params: unknown): JsonSchema | null {
  if (!params || typeof params !== 'object') return null;
  const schema = (params as { requestedSchema?: unknown }).requestedSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  return schema as JsonSchema;
}

/** Prefill form fields from schema `default` values. */
export function elicitationInitialValues(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (prop && typeof prop === 'object' && 'default' in prop) {
      out[key] = (prop as { default?: unknown }).default;
    }
  }
  return out;
}
