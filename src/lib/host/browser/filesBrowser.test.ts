import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserFilesHost } from './filesBrowser';

interface FakeAnchor {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
}

function stubDom(): { anchor: FakeAnchor; revoked: string[] } {
  const anchor: FakeAnchor = { href: '', download: '', click: vi.fn() };
  const revoked: string[] = [];

  vi.stubGlobal('document', { createElement: () => anchor });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:fake-url',
    revokeObjectURL: (url: string) => revoked.push(url),
  });

  return { anchor, revoked };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserFilesHost.saveFile', () => {
  it('clicks a download anchor with the given filename', () => {
    const { anchor } = stubDom();

    browserFilesHost.saveFile('report.md', '# hi', 'text/markdown');

    expect(anchor.download).toBe('report.md');
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it('revokes the object URL afterwards', () => {
    const { revoked } = stubDom();

    browserFilesHost.saveFile('report.md', '# hi', 'text/markdown');

    expect(revoked).toEqual(['blob:fake-url']);
  });
});
