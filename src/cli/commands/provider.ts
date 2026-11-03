import * as clack from '@clack/prompts';
import type { GlobalCliFlags } from '../contracts';
import type { LlmConfig } from '../../lib/agent/types';
import { emitJson, emitMessage, emitTabList } from '../core/output';
import {
  resolveVaultContext,
  CliUsageError,
} from '../core/prelude';
import { writeVaultToDisk } from '../core/vaultSession';
import { EXIT_OK, runCommandSafe } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

function redactConfig(c: LlmConfig): Omit<LlmConfig, 'apiKey'> & { apiKey?: undefined } {
  const { apiKey: _removed, ...rest } = c;
  void _removed;
  return rest;
}

export async function runProvider(args: string[], flags: GlobalCliFlags): Promise<number> {
  const sub = args[0] ?? 'list';
  return runCommandSafe(async () => {
    const ctx = await resolveVaultContext(flags);

    if (sub === 'list') {
      const listed = ctx.llmConfigs.map(redactConfig);
      if (flags.json) {
        await emitJson(listed, flags);
      } else {
        await emitTabList(
          ['id', 'label', 'provider', 'model'],
          listed.map((c) => [c.id, c.label, c.provider, c.model ?? '']),
          flags,
        );
      }
      return EXIT_OK;
    }

    if (sub === 'remove') {
      const id = args[1] ?? flags.server;
      if (!id) throw new CliUsageError('Usage: mcp-detective provider remove <id>');
      ctx.llmConfigs = ctx.llmConfigs.filter((c) => c.id !== id);
      await writeVaultToDisk(ctx);
      return EXIT_OK;
    }

    if (sub === 'add') {
      if (!process.stdin.isTTY) {
        throw new CliUsageError('provider add requires an interactive terminal.');
      }
      const label = await clack.text({ message: 'Label' });
      if (clack.isCancel(label)) throw new CliUsageError('Cancelled.');
      const provider = await clack.select({
        message: 'Provider',
        options: [
          { value: 'openai', label: 'OpenAI-compatible' },
          { value: 'anthropic', label: 'Anthropic' },
          { value: 'gemini', label: 'Gemini' },
        ],
      });
      if (clack.isCancel(provider)) throw new CliUsageError('Cancelled.');
      const baseUrl = await clack.text({ message: 'Base URL' });
      if (clack.isCancel(baseUrl)) throw new CliUsageError('Cancelled.');
      const model = await clack.text({ message: 'Model' });
      if (clack.isCancel(model)) throw new CliUsageError('Cancelled.');
      const apiKey = await clack.password({ message: 'API key' });
      if (clack.isCancel(apiKey)) throw new CliUsageError('Cancelled.');
      const id = `llm-${Date.now()}`;
      ctx.llmConfigs.push({
        id,
        label: String(label),
        provider: provider as LlmConfig['provider'],
        baseUrl: String(baseUrl),
        model: String(model),
        apiKey: String(apiKey),
      });
      await writeVaultToDisk(ctx);
      await emitMessage(`Added provider ${id}`, flags);
      return EXIT_OK;
    }

    process.stderr.write('Usage: mcp-detective provider list|add|remove\n');
    return EXIT_USAGE;
  });
}
