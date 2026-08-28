import { describe, expect, it } from 'vitest';
import { fitsWithinDisplay, isFillingWorkArea, looksMaximized } from './windowHandlers.js';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 };

describe('isFillingWorkArea', () => {
  it('recognises an exact fill', () => {
    expect(isFillingWorkArea({ x: 0, y: 0, width: 1920, height: 1040 }, WORK_AREA)).toBe(true);
  });

  it('tolerates a rounding pixel', () => {
    expect(isFillingWorkArea({ x: 1, y: 0, width: 1919, height: 1040 }, WORK_AREA)).toBe(true);
  });

  it('rejects a normal window', () => {
    expect(isFillingWorkArea({ x: 150, y: 100, width: 900, height: 520 }, WORK_AREA)).toBe(false);
  });

  it('rejects the offset overflow a native frameless maximize produces', () => {
    // This is the actual bug: the manager maximises to the screen plus frame
    // thickness, so the window sits down-right of the origin and overflows.
    expect(isFillingWorkArea({ x: 8, y: 8, width: 1936, height: 1056 }, WORK_AREA)).toBe(false);
  });

  it('accounts for a taskbar offsetting the work area', () => {
    const withTaskbar = { x: 0, y: 40, width: 1920, height: 1000 };
    expect(isFillingWorkArea({ x: 0, y: 40, width: 1920, height: 1000 }, withTaskbar)).toBe(true);
    // Covering the taskbar is not "filling the work area".
    expect(isFillingWorkArea({ x: 0, y: 0, width: 1920, height: 1040 }, withTaskbar)).toBe(false);
  });

  it('rejects a window on a second display', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1040 };
    expect(isFillingWorkArea({ x: 0, y: 0, width: 1920, height: 1040 }, second)).toBe(false);
  });
});

describe('fitsWithinDisplay', () => {
  const DISPLAY = { x: 0, y: 0, width: 1920, height: 1080 };

  it('accepts a window the manager maximised to the work area', () => {
    // What a well-behaved manager produces: full width, short by the taskbar.
    expect(fitsWithinDisplay({ x: 0, y: 0, width: 1920, height: 1040 }, DISPLAY)).toBe(true);
  });

  it('accepts a window filling the whole display', () => {
    expect(fitsWithinDisplay({ x: 0, y: 0, width: 1920, height: 1080 }, DISPLAY)).toBe(true);
  });

  it('rejects the offset overflow a native frameless maximize can produce', () => {
    // The case the self-sizing fallback exists for: down-right of the origin
    // and larger than the screen.
    expect(fitsWithinDisplay({ x: 8, y: 8, width: 1936, height: 1056 }, DISPLAY)).toBe(false);
  });

  it('rejects a window meaningfully wider than the display', () => {
    // Beyond the rounding tolerance — a single pixel over is accepted on
    // purpose, and the "tolerates a rounding pixel" case below pins that down.
    expect(fitsWithinDisplay({ x: 0, y: 0, width: 1936, height: 1080 }, DISPLAY)).toBe(false);
  });

  it('rejects a window starting left of the display origin', () => {
    expect(fitsWithinDisplay({ x: -10, y: 0, width: 1920, height: 1080 }, DISPLAY)).toBe(false);
  });

  it('tolerates a rounding pixel', () => {
    expect(fitsWithinDisplay({ x: -1, y: 0, width: 1921, height: 1080 }, DISPLAY)).toBe(true);
  });

  it('works on a display that is not at the origin', () => {
    const second = { x: 1920, y: 0, width: 2560, height: 1440 };
    // Exactly what WSLg's compositor produces: short by the Windows taskbar.
    expect(fitsWithinDisplay({ x: 1920, y: 0, width: 2560, height: 1392 }, second)).toBe(true);
    expect(fitsWithinDisplay({ x: 0, y: 0, width: 2560, height: 1392 }, second)).toBe(false);
  });
});

describe('looksMaximized', () => {
  const DISPLAY = { x: 0, y: 0, width: 1920, height: 1080 };

  it('accepts a manager maximise that leaves room for a taskbar', () => {
    expect(looksMaximized({ x: 0, y: 0, width: 1920, height: 1040 }, DISPLAY)).toBe(true);
  });

  it('accepts the WSLg shape: full width, short by the Windows taskbar', () => {
    const wslg = { x: 1920, y: 0, width: 2560, height: 1440 };
    expect(looksMaximized({ x: 1920, y: 0, width: 2560, height: 1392 }, wslg)).toBe(true);
  });

  it('rejects a maximise that never happened', () => {
    // With no window manager running -- xvfb, some CI images -- maximize() is a
    // no-op. The window still fits the display, so overflow alone cannot catch it.
    expect(looksMaximized({ x: 100, y: 100, width: 900, height: 600 }, DISPLAY)).toBe(false);
  });

  it('rejects the offset overflow a native frameless maximize can produce', () => {
    expect(looksMaximized({ x: 8, y: 8, width: 1936, height: 1056 }, DISPLAY)).toBe(false);
  });

  it('accepts a display with a wide side dock', () => {
    // ~86% coverage: clearly maximised, just not edge to edge.
    expect(looksMaximized({ x: 200, y: 0, width: 1720, height: 1040 }, DISPLAY)).toBe(true);
  });

  it('rejects a zero-area display rather than dividing by zero', () => {
    expect(looksMaximized({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 0 })).toBe(false);
  });
});
