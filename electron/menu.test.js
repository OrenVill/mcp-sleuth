import { describe, expect, it } from 'vitest';
import { buildMenuTemplate, isDevToolsShortcut, isReloadShortcut } from './menu.js';

/** Shaped like Electron's `before-input-event` input object. */
function key(k, modifiers = {}) {
  return {
    type: 'keyDown',
    key: k,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...modifiers,
  };
}

describe('isReloadShortcut', () => {
  it('matches F5', () => {
    expect(isReloadShortcut(key('F5'))).toBe(true);
  });

  it('matches Ctrl+R', () => {
    expect(isReloadShortcut(key('r', { control: true }))).toBe(true);
    expect(isReloadShortcut(key('R', { control: true }))).toBe(true);
  });

  it('matches Cmd+R', () => {
    expect(isReloadShortcut(key('r', { meta: true }))).toBe(true);
  });

  it('matches Ctrl+Shift+R (force reload)', () => {
    expect(isReloadShortcut(key('R', { control: true, shift: true }))).toBe(true);
    expect(isReloadShortcut(key('r', { meta: true, shift: true }))).toBe(true);
  });

  it('does not match a plain R — typing must still work', () => {
    expect(isReloadShortcut(key('r'))).toBe(false);
    expect(isReloadShortcut(key('R', { shift: true }))).toBe(false);
  });

  it('does not match other Ctrl chords', () => {
    expect(isReloadShortcut(key('t', { control: true }))).toBe(false);
    expect(isReloadShortcut(key('c', { control: true }))).toBe(false);
    expect(isReloadShortcut(key('v', { control: true }))).toBe(false);
  });

  it('leaves the DevTools chords alone', () => {
    expect(isReloadShortcut(key('F12'))).toBe(false);
    expect(isReloadShortcut(key('I', { control: true, shift: true }))).toBe(false);
    expect(isReloadShortcut(key('i', { meta: true, alt: true }))).toBe(false);
  });

  it('ignores key-up so the chord is swallowed exactly once', () => {
    expect(isReloadShortcut({ ...key('F5'), type: 'keyUp' })).toBe(false);
    expect(isReloadShortcut({ ...key('r', { control: true }), type: 'keyUp' })).toBe(false);
  });

  it('is safe on junk input', () => {
    expect(isReloadShortcut(undefined)).toBe(false);
    expect(isReloadShortcut(null)).toBe(false);
    expect(isReloadShortcut('F5')).toBe(false);
    expect(isReloadShortcut({})).toBe(false);
  });
});

describe('isDevToolsShortcut', () => {
  it('matches both browser DevTools chords', () => {
    expect(isDevToolsShortcut(key('F12'))).toBe(true);
    expect(isDevToolsShortcut(key('i', { control: true, shift: true }))).toBe(true);
    expect(isDevToolsShortcut(key('I', { control: true, shift: true }))).toBe(true);
    expect(isDevToolsShortcut(key('i', { meta: true, shift: true }))).toBe(true);
  });

  it('does not match plain or unrelated chords', () => {
    expect(isDevToolsShortcut(key('i'))).toBe(false);
    // Ctrl+I without Shift is a text-formatting chord, not DevTools.
    expect(isDevToolsShortcut(key('i', { control: true }))).toBe(false);
    expect(isDevToolsShortcut(key('F5'))).toBe(false);
    expect(isDevToolsShortcut(key('r', { control: true }))).toBe(false);
    expect(isDevToolsShortcut(null)).toBe(false);
  });

  it('ignores key-up so the chord is swallowed once', () => {
    expect(isDevToolsShortcut({ ...key('F12'), type: 'keyUp' })).toBe(false);
    // A held reload chord is still swallowed every time.
    expect(isReloadShortcut({ ...key('F5'), isAutoRepeat: true })).toBe(true);
  });
});

function rolesIn(template, label) {
  const menu = template.find((m) => m.label === label);
  return (menu?.submenu ?? []).map((item) => item.role).filter(Boolean);
}

describe('buildMenuTemplate', () => {
  it('keeps the clipboard and undo roles registered', () => {
    for (const platform of ['linux', 'win32', 'darwin']) {
      const edit = rolesIn(buildMenuTemplate(platform), 'Edit');
      expect(edit).toEqual(expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']));
    }
  });

  it('has no reload item — a reload drops every live MCP connection', () => {
    for (const platform of ['linux', 'win32', 'darwin']) {
      const roles = buildMenuTemplate(platform)
        .flatMap((m) => m.submenu ?? [])
        .map((item) => item.role);
      expect(roles).not.toContain('reload');
      expect(roles).not.toContain('forceReload');
    }
  });

  it('omits DevTools from the shipped menu — this is an app, not a browser', () => {
    for (const platform of ['linux', 'win32', 'darwin']) {
      expect(rolesIn(buildMenuTemplate(platform), 'View')).not.toContain('toggleDevTools');
    }
  });

  it('offers DevTools only in dev mode', () => {
    const view = rolesIn(buildMenuTemplate('linux', { devMode: true }), 'View');
    expect(view).toContain('toggleDevTools');
  });

  it('has a Window menu with minimize', () => {
    expect(rolesIn(buildMenuTemplate('linux'), 'Window')).toContain('minimize');
    expect(rolesIn(buildMenuTemplate('darwin'), 'Window')).toContain('minimize');
  });

  it('has no Preferences or Settings item — there is no settings screen', () => {
    for (const platform of ['linux', 'win32', 'darwin']) {
      const labels = buildMenuTemplate(platform)
        .flatMap((m) => m.submenu ?? [])
        .map((item) => String(item.label ?? item.role ?? ''));
      expect(labels.some((l) => /preferences|settings/i.test(l))).toBe(false);
    }
  });

  it('puts the app menu first on macOS only', () => {
    expect(buildMenuTemplate('darwin')[0].role).toBe('appMenu');
    expect(buildMenuTemplate('linux')[0].label).toBe('File');
  });

  it('quits from File off macOS, closes on macOS', () => {
    expect(rolesIn(buildMenuTemplate('linux'), 'File')).toEqual(['quit']);
    expect(rolesIn(buildMenuTemplate('darwin'), 'File')).toEqual(['close']);
  });
});
