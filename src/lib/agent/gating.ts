import type { PermissionCategory, ToolPermissionProfile } from '../permissionSurfaceAudit';
import type { AgentToolCall, GateVerdict } from './types';

/**
 * A tool in one of these categories asks on every call and can never be
 * session-allowlisted. These are the categories where a single unreviewed
 * invocation is not recoverable.
 */
export const RISK_LOCKED_CATEGORIES: PermissionCategory[] = [
  'destructive',
  'shell',
  'credential',
  'admin',
];

/** Allowlist entries are per server: the same tool name elsewhere is a different tool. */
export function toolKey(serverId: string, toolName: string): string {
  return `${serverId}:${toolName}`;
}

export function isRiskLocked(profile: ToolPermissionProfile | undefined): boolean {
  if (!profile) return false;
  return profile.categories.some((category) => RISK_LOCKED_CATEGORIES.includes(category));
}

export function gateVerdict(
  call: AgentToolCall,
  profile: ToolPermissionProfile | undefined,
  allowed: ReadonlySet<string>,
): GateVerdict {
  if (isRiskLocked(profile)) return 'ask_locked';
  return allowed.has(toolKey(call.serverId, call.toolName)) ? 'auto' : 'ask';
}

export function rememberAllowed(
  allowed: ReadonlySet<string>,
  call: AgentToolCall,
): Set<string> {
  return new Set([...allowed, toolKey(call.serverId, call.toolName)]);
}
