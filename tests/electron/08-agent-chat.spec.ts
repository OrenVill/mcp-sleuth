import { expect, test } from '@playwright/test';
import {
  closeApp,
  FIXTURE_URL,
  launchApp,
  selectServer,
  setupVault,
  waitForConnected,
  type LaunchedApp,
} from './helpers';

/**
 * Agent Chat in the desktop build.
 *
 * The point of difference from the browser suite is egress: provider HTTP
 * leaves the *main process* over IPC, so the renderer must never touch
 * `/__llm_proxy` — that endpoint is the browser build's CORS workaround and
 * does not exist in the packaged app — nor the provider's own origin.
 *
 * The model is `tests/fixtures/llm-server.mjs`, a scripted OpenAI-compatible
 * server on 3003: the first request in a conversation always asks for
 * `echo_markdown`, and once a tool result is present it answers in prose. A
 * real model would make every assertion below non-deterministic.
 *
 * Serial by design: the tests walk one app through configure → run → capture,
 * and the egress assertion is only meaningful once a run has actually happened.
 */

const MCP_SERVER_NAME = 'Fixture';
const LLM_SERVER_NAME = 'Scripted model';
const LLM_BASE_URL = 'http://127.0.0.1:3003/v1';
const LLM_ORIGIN = '127.0.0.1:3003';
/** Sent from the renderer to prove the request listener below is not dead. */
const PROBE_URL = 'http://127.0.0.1:3001/__request_listener_probe';

test.describe.serial('Electron — Agent Chat', () => {
  let launched: LaunchedApp;
  const rendererRequests: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    launched = await launchApp();
    launched.page.on('request', (req) => rendererRequests.push(req.url()));
    await setupVault(launched.page);

    const page = launched.page;
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Name').fill(MCP_SERVER_NAME);
    await page.getByLabel('MCP HTTP URL').clear();
    await page.getByLabel('MCP HTTP URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: 'Add & connect' }).click();
    await waitForConnected(page, MCP_SERVER_NAME);
    // Makes the fixture the active server, which is what the chat scopes to.
    await selectServer(page, MCP_SERVER_NAME);
  });

  test.afterAll(async () => closeApp(launched));

  test('the chat overlay opens, prompts for a model, and closes', async () => {
    const page = launched.page;
    await page.getByTestId('open-agent-chat').click();
    await expect(page.getByTestId('agent-chat-panel')).toBeVisible();

    // With no LLM server configured the picker opens its own form unprompted,
    // and the composer stays disabled behind it.
    await expect(page.getByTestId('llm-config-form')).toBeVisible();
    await page.getByTestId('llm-config-form').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('llm-config-form')).toBeHidden();
    await expect(page.getByTestId('agent-input')).toBeDisabled();
    await expect(page.getByTestId('agent-input')).toHaveAttribute(
      'placeholder',
      'Add a model to start',
    );

    await page.getByRole('button', { name: 'Back to servers' }).click();
    await expect(page.getByTestId('agent-chat-panel')).toBeHidden();
  });

  test('adding an LLM server discovers its models over IPC', async () => {
    const page = launched.page;
    await page.getByTestId('open-agent-chat').click();
    await expect(page.getByTestId('agent-chat-panel')).toBeVisible();

    const form = page.getByTestId('llm-config-form');
    await expect(form).toBeVisible();
    await form.getByPlaceholder('Local Ollama').fill(LLM_SERVER_NAME);
    const baseUrl = form.getByRole('textbox', { name: 'Base URL' });
    await baseUrl.clear();
    await baseUrl.fill(LLM_BASE_URL);
    await form.getByRole('button', { name: 'Add server' }).click();
    await expect(form).toBeHidden();

    // The pill shows the adopted model, so discovery reached the fixture's
    // /v1/models and the first message will not go out with an empty model.
    await expect(page.getByTestId('llm-picker')).toContainText('fixture-model', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('llm-picker')).toContainText(LLM_SERVER_NAME);

    // Both selects live in a popover portalled to the body, so they are looked
    // up on the page rather than inside the panel.
    await page.getByTestId('llm-picker').click();
    await expect(page.getByTestId('llm-config-select')).toContainText(LLM_SERVER_NAME);
    await expect(page.getByTestId('llm-model-select')).toContainText('fixture-model');
    await page.keyboard.press('Escape');

    // The connected fixture is in scope by default, so the chat is runnable.
    await expect(page.getByTestId('mcp-scope-picker')).toContainText('1 of 1 server');
    await expect(page.getByTestId('agent-input')).toBeEnabled();
  });

  test('a scripted turn gates the tool call, runs it, and the model answers', async () => {
    const page = launched.page;
    await page.getByTestId('agent-input').fill('say hello');
    await page.getByTestId('agent-send').click();

    const approval = page.getByTestId('tool-call-approval');
    await expect(approval).toBeVisible({ timeout: 20_000 });
    await expect(approval).toContainText('echo_markdown');
    await expect(approval).toContainText(MCP_SERVER_NAME);
    await expect(approval).toContainText('hello from the agent');

    // The gate is a gate: no `tools/call` has been issued yet, so the live
    // trace beside the transcript is still empty.
    await expect(page.getByTestId('trace-row')).toHaveCount(0);

    await approval.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(approval).toBeHidden();

    const step = page.getByTestId('tool-step');
    await expect(step).toHaveCount(1, { timeout: 20_000 });
    // A successful step renders collapsed, so the result has to be opened.
    await step.locator('button[aria-expanded]').click();
    await expect(page.getByTestId('tool-result')).toContainText(
      'You sent **hello from the agent**',
    );

    // Turn 2 of the script: with a tool result in the conversation the model
    // stops calling tools and answers.
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('agent-error')).toHaveCount(0);
  });

  test("the run's tool call is traced and can be captured as a replay suite", async () => {
    const page = launched.page;
    const rows = page.getByTestId('trace-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('echo_markdown');

    await page.getByTestId('capture-replay-suite').click();
    await expect(page.getByTestId('agent-notice')).toContainText('Captured 1 call');
  });

  test('provider traffic never left the renderer', async () => {
    const page = launched.page;

    // Guards the assertions below against a listener that silently records
    // nothing: a renderer-issued request must show up in `rendererRequests`.
    await page.evaluate(
      (url) => fetch(url).catch(() => undefined),
      PROBE_URL,
    );
    await expect
      .poll(() => rendererRequests.filter((url) => url.includes('__request_listener_probe')))
      .toHaveLength(1);

    // The run in the previous tests proves the provider was reached. It was not
    // reached from here, so it was reached from the main process.
    expect(rendererRequests.filter((url) => url.includes('__llm_proxy'))).toEqual([]);
    expect(rendererRequests.filter((url) => url.includes(LLM_ORIGIN))).toEqual([]);
  });
});
