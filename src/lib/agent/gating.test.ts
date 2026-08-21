import { describe, expect, it } from 'vitest';
import type { ToolPermissionProfile } from '../permissionSurfaceAudit';
import { RISK_LOCKED_CATEGORIES, gateVerdict, isRiskLocked, rememberAllowed, toolKey } from './gating';

const profile = (categories: ToolPermissionProfile['categories']): ToolPermissionProfile => ({
  toolName: 'do_thing',
  categories,
  signals: [],
});

const call = { id: 'c1', llmName: 'do_thing', serverId: 's1', toolName: 'do_thing', args: {} };

describe('isRiskLocked', () => {
  it.each(RISK_LOCKED_CATEGORIES)('locks %s', (category) => {
    expect(isRiskLocked(profile([category]))).toBe(true);
  });

  it('does not lock read-only categories', () => {
    expect(isRiskLocked(profile(['data_read', 'network']))).toBe(false);
  });

  it('does not lock a tool with no profile', () => {
    expect(isRiskLocked(undefined)).toBe(false);
  });
});

describe('gateVerdict', () => {
  it('asks when the tool is not allowlisted', () => {
    expect(gateVerdict(call, profile(['data_read']), new Set())).toBe('ask');
  });

  it('auto-allows an allowlisted tool', () => {
    const allowed = new Set([toolKey('s1', 'do_thing')]);
    expect(gateVerdict(call, profile(['data_read']), allowed)).toBe('auto');
  });

  it('asks every time for a risk-locked tool even when allowlisted', () => {
    const allowed = new Set([toolKey('s1', 'do_thing')]);
    expect(gateVerdict(call, profile(['shell']), allowed)).toBe('ask_locked');
  });

  it('keys the allowlist per server, so the same tool name on another server still asks', () => {
    const allowed = new Set([toolKey('s2', 'do_thing')]);
    expect(gateVerdict(call, profile(['data_read']), allowed)).toBe('ask');
  });
});

describe('rememberAllowed', () => {
  it('returns a new set containing the call', () => {
    const before = new Set<string>();
    const after = rememberAllowed(before, call);
    expect(after.has(toolKey('s1', 'do_thing'))).toBe(true);
    expect(before.size).toBe(0);
  });
});
