import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns true when navigator.clipboard.writeText succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const execCommand = vi.fn().mockReturnValue(true);
    const textarea = {
      value: '',
      setAttribute: vi.fn(),
      style: {} as CSSStyleDeclaration,
      select: vi.fn(),
    };
    const body = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(textarea),
      body,
      execCommand,
    });

    await expect(copyText('fallback')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(body.appendChild).toHaveBeenCalled();
  });

  it('returns false when both clipboard and execCommand fail', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('nope')) } });
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        value: '',
        setAttribute: vi.fn(),
        style: {},
        select: vi.fn(),
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn().mockReturnValue(false),
    });

    await expect(copyText('nope')).resolves.toBe(false);
  });

  it('never throws when clipboard is missing', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        value: '',
        setAttribute: vi.fn(),
        style: {},
        select: vi.fn(),
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn().mockReturnValue(false),
    });

    await expect(copyText('text')).resolves.toBe(false);
  });
});
