import { test, expect } from '@playwright/test';
import { closeApp, launchApp, type LaunchedApp } from './helpers';

test.describe.serial('Electron — launch and security posture', () => {
  let launched: LaunchedApp;
  const consoleErrors: string[] = [];

  test.beforeAll(async () => {
    launched = await launchApp();
    launched.page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await launched.page.waitForTimeout(1_500);
  });

  test.afterAll(async () => closeApp(launched));

  test('window opens on the vault setup screen', async () => {
    // The navbar (and its h1) only mounts after the vault exists, so the first
    // screen is Create vault.
    await expect(launched.page.getByRole('button', { name: 'Create vault' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('renderer is served over the app:// origin, not file://', async () => {
    const origin = await launched.page.evaluate(() => location.origin);
    expect(origin).toBe('app://mcp-explorer');
  });

  test('the preload bridge is exposed and frozen', async () => {
    const info = await launched.page.evaluate(() => ({
      kind: (window as unknown as { mcpExplorer?: { kind?: string } }).mcpExplorer?.kind,
      frozen: Object.isFrozen((window as unknown as { mcpExplorer?: object }).mcpExplorer),
    }));

    expect(info.kind).toBe('electron');
    expect(info.frozen).toBe(true);
  });

  test('the renderer has no Node access', async () => {
    const leaked = await launched.page.evaluate(
      () =>
        typeof (globalThis as Record<string, unknown>).require !== 'undefined' ||
        typeof (globalThis as Record<string, unknown>).process !== 'undefined',
    );
    expect(leaked).toBe(false);
  });

  test('ipcRenderer is not reachable from the renderer', async () => {
    const reachable = await launched.page.evaluate(() => {
      const bridge = (window as unknown as { mcpExplorer: Record<string, unknown> }).mcpExplorer;
      return 'ipcRenderer' in bridge || 'send' in bridge || 'on' in bridge;
    });
    expect(reachable).toBe(false);
  });

  test('non-allow-listed IPC channels are blocked', async () => {
    const message = await launched.page.evaluate(async () => {
      const bridge = (window as unknown as {
        mcpExplorer: { invoke: (c: string) => Promise<unknown> };
      }).mcpExplorer;
      try {
        await bridge.invoke('mcp:evil');
        return 'allowed';
      } catch (err) {
        return (err as Error).message;
      }
    });

    expect(message).toContain('Blocked IPC channel');
  });

  test('no console errors during startup', () => {
    expect(consoleErrors).toEqual([]);
  });
});
