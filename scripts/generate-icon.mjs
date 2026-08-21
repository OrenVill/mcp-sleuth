#!/usr/bin/env node
/**
 * Rasterise build/icon.svg to build/icon.png for electron-builder.
 *
 * Rendered with Electron itself rather than adding an image-processing
 * dependency — the repo already has a browser engine, and CLAUDE.md forbids new
 * deps where existing tooling suffices. electron-builder derives the .ico and
 * .icns from this PNG.
 *
 * Run: npx electron scripts/generate-icon.mjs
 */
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_SIZE = 1024;

/**
 * Linux desktop environments pick the closest installed size rather than
 * scaling one large icon, so a lone 1024px file renders badly or is ignored.
 * electron-builder picks these up from build/icons/.
 */
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = readFileSync('build/icon.svg', 'utf8');
  const win = new BrowserWindow({
    width: SOURCE_SIZE,
    height: SOURCE_SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });

  const html =
    `<html><body style="margin:0;width:${SOURCE_SIZE}px;height:${SOURCE_SIZE}px">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 700));

  const master = await win.webContents.capturePage({
    x: 0,
    y: 0,
    width: SOURCE_SIZE,
    height: SOURCE_SIZE,
  });

  // electron-builder derives .ico and .icns from this one.
  writeFileSync('build/icon.png', master.toPNG());

  mkdirSync('build/icons', { recursive: true });
  for (const size of LINUX_SIZES) {
    const resized = size === SOURCE_SIZE ? master : master.resize({ width: size, height: size });
    writeFileSync(join('build/icons', `${size}x${size}.png`), resized.toPNG());
  }

  // Packaged with the app so BrowserWindow can set the window icon at runtime.
  // Without it Linux taskbars fall back to the generic Electron/X11 icon.
  mkdirSync('electron/assets', { recursive: true });
  writeFileSync('electron/assets/icon.png', master.resize({ width: 256, height: 256 }).toPNG());

  console.log(`wrote build/icon.png, ${LINUX_SIZES.length} sizes in build/icons/, and electron/assets/icon.png`);
  app.quit();
});
