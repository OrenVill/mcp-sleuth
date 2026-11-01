import { describe, expect, it } from 'vitest';
import {
  TITLE_BAR_HEIGHT,
  WINDOW_BACKGROUND,
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
