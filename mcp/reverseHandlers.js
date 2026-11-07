import {
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  ListRootsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getMcpRoots, notifyInbound, waitForReverseApproval } from './reverseBridge.js';

export const DETECTIVE_CLIENT_CAPABILITIES = {
  sampling: {},
  elicitation: { form: {} },
  roots: { listChanged: true },
};

/**
 * @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client
 * @param {string} serverId
 * @param {{
 *   waitForApproval?: typeof waitForReverseApproval;
 *   onInbound?: (entry: { serverId: string; method: string; params?: unknown }) => void;
 *   getRoots?: () => Array<{ uri: string; name?: string }>;
 * }} [options]
 */
export function attachReverseRequestHandlers(client, serverId, options = {}) {
  const waitForApproval = options.waitForApproval ?? waitForReverseApproval;
  const getRoots = options.getRoots ?? getMcpRoots;
  const onInbound = options.onInbound ?? notifyInbound;

  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: getRoots() }));

  client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    return waitForApproval({
      serverId,
      kind: 'sampling',
      method: 'sampling/createMessage',
      params: request.params,
    });
  });

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    if (request.params.mode && request.params.mode !== 'form') {
      return { action: 'decline' };
    }
    const result = await waitForApproval({
      serverId,
      kind: 'elicitation',
      method: 'elicitation/create',
      params: request.params,
    });
    return result;
  });

  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    onInbound({ serverId, method: 'notifications/message', params: notification.params });
  });

  client.setNotificationHandler(ProgressNotificationSchema, (notification) => {
    onInbound({ serverId, method: 'notifications/progress', params: notification.params });
  });
}
