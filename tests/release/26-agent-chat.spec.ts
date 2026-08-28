import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { setupVault, addFixtureServer } from './helpers';

// §3.26 — Agent Chat
//
// Runs against tests/fixtures/llm-server.mjs, a scripted OpenAI-compatible
// model on 3003. A real model is non-deterministic and needs a paid key, so
// none of these assertions would be possible without it. Its contract: a
// request carrying no tool results asks for `echo_markdown`; once a tool result
// is present it answers in prose. That is one tool call per conversation, so
// each test that needs a fresh call reopens the overlay.
//
// The controls here are not native elements. `Select` renders a
// <button role="combobox"> plus a listbox portalled to document.body, and
// `Popover` renders a trigger plus a role="dialog" also portalled — so
// selectOption() does not apply, and option lookups must not be scoped to the
// panel that opened them.

const LLM_BASE = 'http://127.0.0.1:3003/v1';

async function openChat(page: Page): Promise<void> {
  await page.getByTestId('open-agent-chat').click();
  await expect(page.getByTestId('agent-chat-panel')).toBeVisible();
}

async function closeChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to servers' }).click();
  await expect(page.getByTestId('agent-chat-panel')).toBeHidden();
}

/** Configure the fixture model, if this vault has none yet. */
async function addFixtureModel(page: Page): Promise<void> {
  const form = page.getByTestId('llm-config-form');
  if (!(await form.isVisible().catch(() => false))) return;
  await form.getByPlaceholder('Local Ollama').fill('Fixture LLM');
  await page.getByRole('textbox', { name: 'Base URL' }).fill(LLM_BASE);
  await form.getByRole('button', { name: 'Add server' }).click();
  // Discovery must have adopted a model, or the first send would go out with an
  // empty model name.
  await expect(page.getByTestId('llm-picker')).toContainText('fixture-model', {
    timeout: 10_000,
  });
}

/** Send a prompt and wait for the model to ask for its tool. */
async function sendAndAwaitApproval(page: Page, prompt: string) {
  await page.getByTestId('agent-input').fill(prompt);
  await page.getByTestId('agent-send').click();
  const approval = page.getByTestId('tool-call-approval');
  await expect(approval).toBeVisible({ timeout: 15_000 });
  return approval;
}

test.describe.serial('§3.26 — Agent Chat', () => {
  let ctx: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await setupVault(page);
    await addFixtureServer(page);
    await openChat(page);
    await addFixtureModel(page);
  });

  test.afterAll(() => ctx.close());

  test('the header reports readiness and the tool count', async () => {
    await expect(page.getByTestId('agent-chat-panel')).toContainText('5 tools exposed');
    await expect(page.getByTestId('agent-input')).toBeEnabled();
  });

  test('the model asks for a tool and the call is gated before it runs', async () => {
    const approval = await sendAndAwaitApproval(page, 'say hello');
    await expect(approval).toContainText('echo_markdown');
    // The arguments are shown, not just the tool name — approving blind would
    // defeat the point of the gate.
    await expect(approval).toContainText('hello from the agent');
    // Nothing has run yet.
    await expect(page.getByTestId('trace-row')).toHaveCount(0);
  });

  test('allowing the call runs it and the model answers', async () => {
    await page
      .getByTestId('tool-call-approval')
      .getByRole('button', { name: 'Allow', exact: true })
      .click();

    // A trace row, not the tool step: the step renders as soon as the assistant
    // message carrying the call arrives, so it is already on screen while the
    // gate is open and proves nothing here. A protocol trace only exists once
    // tools/call was actually issued.
    await expect(page.getByTestId('trace-row')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done', {
      timeout: 15_000,
    });
  });

  test('the executed call appears in the live trace', async () => {
    const row = page.getByTestId('trace-row').first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('echo_markdown');
  });

  test('a finished run can be captured as a replay suite', async () => {
    await page.getByTestId('capture-replay-suite').click();
    await expect(page.getByTestId('agent-notice')).toContainText('replay suite');
  });

  test('denying a call asks why, and the run continues instead of aborting', async () => {
    // Fresh conversation: the fixture only calls a tool when no tool result is
    // present in the request.
    await closeChat(page);
    await openChat(page);

    const approval = await sendAndAwaitApproval(page, 'try again');
    await approval.getByRole('button', { name: 'Deny' }).click();

    // The reason is the signal Agent Readiness consumes, so it must be asked for.
    await expect(approval.getByRole('button', { name: 'Wrong tool' })).toBeVisible();
    await approval.getByRole('button', { name: 'Wrong tool' }).click();

    // Denial is fed back to the model rather than ending the run.
    await expect(page.getByTestId('agent-transcript')).toContainText('denied', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done', {
      timeout: 15_000,
    });
  });

  test('the MCP scope popover lists the connected server', async () => {
    await page.getByTestId('mcp-scope-picker').click();
    const scope = page.getByRole('dialog', { name: 'MCP servers in scope' });
    await expect(scope).toBeVisible();
    await expect(scope).toContainText('Fixture');
    await page.keyboard.press('Escape');
  });

  test('with no server in scope the composer is disabled and says why', async () => {
    await page.getByTestId('mcp-scope-picker').click();
    const scope = page.getByRole('dialog', { name: 'MCP servers in scope' });
    await scope.getByRole('checkbox').first().uncheck();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('agent-input')).toBeDisabled();
    await expect(page.getByTestId('agent-chat-panel')).toContainText('No server in scope');

    // Put it back so the suite leaves the app usable.
    await page.getByTestId('mcp-scope-picker').click();
    await page.getByRole('dialog', { name: 'MCP servers in scope' })
      .getByRole('checkbox')
      .first()
      .check();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('agent-input')).toBeEnabled();
  });
});
