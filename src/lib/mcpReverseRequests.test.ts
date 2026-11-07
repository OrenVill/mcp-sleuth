import { describe, expect, test } from 'vitest';
import {
  enqueueReverseRequest,
  getPendingReverseRequests,
  registerBridgedReverseRequest,
  rejectPendingReverseRequest,
  resolvePendingReverseRequest,
} from './mcpReverseRequests';

describe('mcpReverseRequests', () => {
  test('queues and resolves a pending request', async () => {
    const pending = enqueueReverseRequest({
      serverId: 's1',
      kind: 'elicitation',
      method: 'elicitation/create',
      params: { message: 'ok?' },
    });
    expect(getPendingReverseRequests()).toHaveLength(1);
    resolvePendingReverseRequest(getPendingReverseRequests()[0]!.id, { action: 'decline' });
    await expect(pending).resolves.toEqual({ action: 'decline' });
    expect(getPendingReverseRequests()).toHaveLength(0);
  });

  test('reject removes pending', async () => {
    const pending = enqueueReverseRequest({
      serverId: 's1',
      kind: 'sampling',
      method: 'sampling/createMessage',
      params: {},
    });
    const id = getPendingReverseRequests()[0]!.id;
    rejectPendingReverseRequest(id, 'nope');
    await expect(pending).rejects.toThrow(/nope/);
    expect(getPendingReverseRequests()).toHaveLength(0);
  });

  test('bridged requests notify UI and complete via callback', () => {
    let settled: unknown;
    registerBridgedReverseRequest({
      id: 'rev-main-1',
      serverId: 's1',
      kind: 'elicitation',
      method: 'elicitation/create',
      params: {},
      complete: (result) => {
        settled = result;
      },
    });
    expect(getPendingReverseRequests()[0]?.id).toBe('rev-main-1');
    resolvePendingReverseRequest('rev-main-1', { action: 'accept', content: { ok: true } });
    expect(settled).toEqual({ action: 'accept', content: { ok: true } });
    expect(getPendingReverseRequests()).toHaveLength(0);
  });
});
