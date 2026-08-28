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
    // The transcript's copy buttons go through navigator.clipboard, which is
    // denied by default in a fresh context.
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
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

  test('a working indicator shows whenever the agent, not the user, has the turn', async () => {
    // Fresh conversation, and the prompt says "slowly" — the fixture stalls
    // before its first token on that word, which is the only way to observe an
    // indicator that exists precisely while nothing else is on screen.
    await closeChat(page);
    await openChat(page);

    await page.getByTestId('agent-input').fill('answer slowly');
    await page.getByTestId('agent-send').click();

    const working = page.getByTestId('agent-working');
    await expect(working).toBeVisible();

    // The approval card is the user's turn: the agent is not working, it is
    // waiting, and claiming otherwise would be a lie about who is blocked.
    const approval = page.getByTestId('tool-call-approval');
    await expect(approval).toBeVisible({ timeout: 15_000 });
    await expect(working).toBeHidden();

    // Allowing it hands the turn back — the tool runs, then the model thinks
    // again, and both of those gaps are covered.
    await approval.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(working).toBeVisible();

    await expect(page.getByTestId('agent-transcript')).toContainText('We are done', {
      timeout: 20_000,
    });
    // The run is over; a spinner that never stops is worse than none.
    await expect(working).toBeHidden();
  });

  test('Enter sends and Shift+Enter writes a newline instead', async () => {
    const composer = page.getByTestId('agent-input');
    await composer.click();
    await page.keyboard.type('first line');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');

    // Still in the box: a newline must not have sent it.
    await expect(composer).toHaveValue('first line\nsecond line');
    await expect(page.getByTestId('tool-call-approval')).toBeHidden();

    // And the composer grew rather than scrolling one line under the cursor.
    const height = await composer.evaluate((el) => el.clientHeight);
    expect(height).toBeGreaterThan(24);
  });

  test('typing during a run queues the message instead of eating it', async () => {
    // This is the regression the queue exists for: the composer used to clear
    // itself and `send` then refused mid-run, so the text was simply gone.
    await closeChat(page);
    await openChat(page);

    await page.getByTestId('agent-input').fill('answer slowly');
    await page.getByTestId('agent-send').click();

    await page.getByTestId('agent-input').fill('a follow-up question');
    await page.keyboard.press('Enter');

    const queued = page.getByTestId('agent-queued');
    await expect(queued).toContainText('a follow-up question');
    await expect(page.getByTestId('agent-input')).toHaveValue('');

    // Cancelling drops it, and the next one queues just the same.
    await page.getByTestId('agent-cancel-queued').click();
    await expect(queued).toBeHidden();

    await page.getByTestId('agent-input').fill('the real follow-up');
    await page.keyboard.press('Enter');
    await expect(queued).toContainText('the real follow-up');

    // Draining is the half that matters: once the run ends the queued text is
    // sent on its own, and shows up as a user turn.
    const approval = page.getByTestId('tool-call-approval');
    await expect(approval).toBeVisible({ timeout: 15_000 });
    await approval.getByRole('button', { name: 'Allow', exact: true }).click();

    await expect(page.getByTestId('agent-transcript')).toContainText('the real follow-up', {
      timeout: 30_000,
    });
    await expect(queued).toBeHidden();
  });

  test('a tool result too long for its box can be expanded in place', async () => {
    await closeChat(page);
    await openChat(page);
    const approval = await sendAndAwaitApproval(page, 'echo something long');
    await approval.getByRole('button', { name: 'Allow', exact: true }).click();

    const step = page.getByTestId('tool-step').last();
    // A successful step stays collapsed by design, so the result has to be
    // opened before there is anything to expand.
    await expect(step).toBeVisible({ timeout: 15_000 });
    await step.locator('button[aria-expanded]').first().click();
    await expect(step.getByTestId('tool-result')).toBeVisible({ timeout: 15_000 });

    const expander = step.getByTestId('tool-result-expand');
    await expect(expander).toBeVisible();
    await expander.click();
    await expect(expander).toHaveAttribute('aria-expanded', 'true');
    // Expanded means the whole payload is readable, not a taller clipped box.
    const clipped = await step
      .getByTestId('tool-result')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped).toBe(false);
  });

  test('scrolled away from the bottom, there is a way back', async () => {
    // The expanded payload above is what makes the transcript overflow; the
    // pill only exists once there is something above the fold to be lost in.
    const scroller = page.getByTestId('agent-transcript');
    const overflow = await scroller.evaluate((el) => {
      let node = el.parentElement;
      while (node && getComputedStyle(node).overflowY !== 'auto') node = node.parentElement;
      if (!node) return 0;
      node.scrollTop = node.scrollHeight;
      return node.scrollHeight - node.clientHeight;
    });
    // The at-bottom test allows 80px of slack, so a shorter transcript would
    // never register as scrolled away and this would assert nothing.
    expect(overflow).toBeGreaterThan(80);

    await scroller.evaluate((el) => {
      let node = el.parentElement;
      while (node && getComputedStyle(node).overflowY !== 'auto') node = node.parentElement;
      if (node) node.scrollTop = 0;
    });

    const pill = page.getByTestId('agent-jump-to-latest');
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(pill).toBeHidden();
  });

  test('New chat clears the conversation without leaving the overlay', async () => {
    const newChat = page.getByTestId('agent-new-chat');
    await expect(newChat).toBeVisible();
    await newChat.click();

    await expect(page.getByTestId('agent-transcript')).toBeHidden();
    await expect(page.getByTestId('agent-chat-panel')).toContainText('Ask the model to use this');
    // Nothing left to clear, so the button retires until there is.
    await expect(newChat).toBeHidden();
  });

  test('Escape closes the chat, but not out from under an open picker', async () => {
    await page.getByTestId('mcp-scope-picker').click();
    await expect(page.getByRole('dialog', { name: 'MCP servers in scope' })).toBeVisible();

    // The popover handles this Escape itself. The chat must survive it, or
    // every picker dismissal would throw the user out of the conversation.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'MCP servers in scope' })).toBeHidden();
    await expect(page.getByTestId('agent-chat-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('agent-chat-panel')).toBeHidden();
    await openChat(page);
  });

  test('a failed turn offers Retry, and retrying does not duplicate the prompt', async () => {
    // The fixture fails the first "explode" request and answers the second, so
    // this drives the error surface and the recovery in one run.
    await page.getByTestId('agent-input').fill('please explode');
    await page.getByTestId('agent-send').click();

    await expect(page.getByTestId('agent-error')).toBeVisible({ timeout: 15_000 });
    const retry = page.getByTestId('agent-retry');
    await expect(retry).toBeEnabled();
    await retry.click();

    await expect(page.getByTestId('agent-transcript')).toContainText('Recovered after the failure', {
      timeout: 15_000,
    });
    // Retry re-runs the existing history rather than appending a second copy
    // of the prompt — a duplicated user turn would also corrupt the transcript
    // the model sees on the next turn.
    await expect(page.getByText('please explode', { exact: true })).toHaveCount(1);
  });

  test('Stop leaves the run cancelled but retryable', async () => {
    await closeChat(page);
    await openChat(page);

    await page.getByTestId('agent-input').fill('answer slowly');
    await page.getByTestId('agent-send').click();
    await expect(page.getByTestId('tool-call-approval')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByTestId('agent-error')).toContainText('cancelled');
    // Stopping at the gate still answers the pending call — the transcript
    // records the refusal rather than leaving the turn dangling.
    await expect(page.getByTestId('agent-transcript')).toContainText('denied');

    const retry = page.getByTestId('agent-retry');
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('agent-error')).toHaveCount(0);
  });

  test('the approval card takes focus without arming Enter to approve', async () => {
    await closeChat(page);
    await openChat(page);
    const approval = await sendAndAwaitApproval(page, 'gate the keyboard');

    // The card, deliberately not the Allow button: the card can arrive while
    // the user is mid-sentence in the composer, and a focused Allow would turn
    // a stray Enter into an approved tool call.
    await expect(approval).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(approval).toBeVisible();
    await expect(page.getByTestId('tool-result')).toHaveCount(0);

    // One Tab away, and then it approves.
    await page.keyboard.press('Tab');
    await expect(approval.getByRole('button', { name: 'Allow', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('agent-transcript')).toContainText('We are done', {
      timeout: 15_000,
    });
  });

  test('an assistant message copies as its markdown source, not the rendered text', async () => {
    await page.getByTestId('assistant-copy').last().click();
    await expect(page.getByTestId('assistant-copy').last()).toContainText('Copied');

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // The fixture wraps its ending in bold. Rendered, the asterisks are gone —
    // finding them proves the raw source was copied.
    expect(copied).toContain('**We are done.**');
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
