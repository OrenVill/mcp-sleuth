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
import { readFileSync, writeFileSync } from 'node:fs';

const SIZE = 1024;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const svg = readFileSync('build/icon.svg', 'utf8');
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });

  const html = `<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 700));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  writeFileSync('build/icon.png', image.toPNG());
  console.log(`wrote build/icon.png (${image.getSize().width}x${image.getSize().height})`);
  app.quit();
});
