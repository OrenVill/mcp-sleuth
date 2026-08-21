import { describe, expect, it, vi } from 'vitest';
import { browserUpdateHost } from './updatesBrowser';

describe('browserUpdateHost', () => {
  it('reports no update channel, which is what hides the banner and the pill', async () => {
    await expect(browserUpdateHost.getStatus()).resolves.toBeNull();
    await expect(browserUpdateHost.check()).resolves.toBeNull();
  });

  it('accepts the mutators without doing anything', async () => {
    await expect(browserUpdateHost.setAutoCheck(false)).resolves.toBeNull();
    await expect(browserUpdateHost.skip('1.2.0')).resolves.toBeNull();
    await expect(browserUpdateHost.dismiss('1.2.0')).resolves.toBeNull();
    await expect(browserUpdateHost.openRelease()).resolves.toBeUndefined();
  });

  it('never calls a subscriber, and its unsubscribe is safe to call', () => {
    const handler = vi.fn();
    const unsubscribe = browserUpdateHost.onUpdateAvailable(handler);

    expect(handler).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});
