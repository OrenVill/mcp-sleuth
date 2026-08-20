import { describe, expect, it } from 'vitest';
import { isFillingWorkArea } from './windowHandlers.js';

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
