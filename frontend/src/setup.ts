import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/* Test environment shims.
 * jsdom does not implement matchMedia or scrollIntoView, both of which the
 * app calls; without these shims every render throws.
 *
 * Node 22+ ships a native `localStorage` global that is *unavailable*
 * unless the process is started with `--localstorage-file`, and it shadows
 * the jsdom implementation. The app stores its auth token there, so a
 * deterministic in-memory Storage is installed instead. */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
}

function installStorage(target: any) {
  try {
    const s = new MemoryStorage();
    Object.defineProperty(target, "localStorage", { value: s, configurable: true, writable: true });
    return s;
  } catch { /* ignore */ }
}

const storage = installStorage(globalThis) || installStorage(window);

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as any;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => "blob:mock";
  window.URL.revokeObjectURL = () => {};
}

/* Recharts' ResponsiveContainer observes its parent with a ResizeObserver,
 * which jsdom does not implement. Without the stub, any page that renders a
 * chart crashes the whole tree. */
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!(window as any).ResizeObserver) {
  (window as any).ResizeObserver = (globalThis as any).ResizeObserver;
}

/** Reset the store between tests so no token leaks from one case to the next. */
export function resetStorage() {
  storage?.clear();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStorage();
});
