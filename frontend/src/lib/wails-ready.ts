/**
 * Wails runtime readiness utilities.
 *
 * In Wails v3, `@wailsio/runtime` communicates over the `/wails/runtime` HTTP
 * endpoint and initializes `window._wails` on module import, so bindings are
 * immediately ready in the browser/webview environment.
 */

declare global {
  interface Window {
    _wails?: Record<string, unknown>;
  }
}

/** Returns true if the Wails runtime environment is available on `window`. */
export function isWailsReady(): boolean {
  return typeof window !== "undefined";
}

/**
 * Returns a promise that resolves once the Wails runtime is ready.
 * In Wails v3, resolves immediately on the client.
 */
export function waitForWails(_timeoutMs = 10_000): Promise<void> {
  return Promise.resolve();
}
