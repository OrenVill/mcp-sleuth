import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TITLE_BAR_HEIGHT,
  WINDOW_BACKGROUND,
  WINDOWS_CAPTION_RESERVE_PX,
  WINDOWS_OVERLAY_SYMBOL,
  resolveWindowChromeOptions,
} from './windowChrome.js';

describe('resolveWindowChromeOptions', () => {
  it('keeps native traffic lights on macOS', () => {
    expect(resolveWindowChromeOptions('darwin')).toEqual({
      backgroundColor: WINDOW_BACKGROUND,
      titleBarStyle: 'hiddenInset',
    });
  });

  it('uses a thick frame and title bar overlay on Windows for Aero Snap', () => {
    expect(resolveWindowChromeOptions('win32')).toEqual({
      frame: false,
      backgroundColor: WINDOW_BACKGROUND,
      titleBarStyle: 'hidden',
      thickFrame: true,
      titleBarOverlay: {
        color: WINDOW_BACKGROUND,
        symbolColor: WINDOWS_OVERLAY_SYMBOL,
        height: TITLE_BAR_HEIGHT,
      },
    });
  });

  it('does not enable thickFrame or titleBarOverlay on Windows for other platforms', () => {
    for (const platform of ['linux', 'freebsd', 'openbsd']) {
      expect(resolveWindowChromeOptions(platform)).toEqual({
        frame: false,
        transparent: true,
      });
    }
  });

  it('never marks Windows chrome transparent', () => {
    const options = resolveWindowChromeOptions('win32');
    expect(options.transparent).toBeUndefined();
    expect(options.thickFrame).toBe(true);
  });
});

describe('Windows title bar drag vs native caption overlay', () => {
  it('reserves a fixed width for native caption hit-testing', () => {
    expect(WINDOWS_CAPTION_RESERVE_PX).toBeGreaterThan(0);
  });

  it('keeps the caption reserve out of the web drag region in index.css', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');
    const reserve = `${WINDOWS_CAPTION_RESERVE_PX}px`;
    expect(css).toContain(`padding-right: ${reserve}`);
    expect(css).toMatch(
      /\[data-host='electron'\]\[data-platform='win32'\] \.app-header[\s\S]*app-region: no-drag/,
    );
    expect(css).toContain(`right: ${reserve}`);
    expect(css).toMatch(
      /\[data-platform='win32'\] \.app-header::before[\s\S]*app-region: drag/,
    );
  });
});
