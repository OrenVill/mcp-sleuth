import {
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  ListRootsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

export const DETECTIVE_CLIENT_CAPABILITIES = {
  sampling: {},
  elicitation: { form: {} },
  roots: { listChanged: true },
};

const DEFAULT_ROOTS = [{ uri: 'file:///', name: 'Filesystem root' }];

/**
 * @param {import('@modelcontextprotocol/sdk/client/index.js').Client} client
 * @param {string} serverId
 * @param {{ onInbound?: (entry: { serverId: string; method: string; params?: unknown }) => void }} [options]
 */
export function attachReverseRequestHandlers(client, serverId, options = {}) {
  const onInbound = options.onInbound;

  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: DEFAULT_ROOTS }));

  client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    onInbound?.({ serverId, method: 'sampling/createMessage', params: request.params });
    return {
      model: 'mcp-detective-stub',
      role: 'assistant',
      content: { type: 'text', text: 'Sampling approved (desktop stub).' },
    };
  });

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    onInbound?.({ serverId, method: 'elicitation/create', params: request.params });
    if (request.params.mode && request.params.mode !== 'form') {
      return { action: 'decline' };
    }
    return { action: 'decline' };
  });

  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    onInbound?.({ serverId, method: 'notifications/message', params: notification.params });
  });

  client.setNotificationHandler(ProgressNotificationSchema, (notification) => {
    onInbound?.({ serverId, method: 'notifications/progress', params: notification.params });
  });
}
