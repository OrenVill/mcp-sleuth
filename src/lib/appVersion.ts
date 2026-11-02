declare const __APP_VERSION__: string | undefined;

/** Semver of the running build (from package.json at build time). */
export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
}
