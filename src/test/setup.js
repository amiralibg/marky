import "@testing-library/jest-dom/vitest";

// jsdom implements Range but not its geometry methods, so any CodeMirror
// measure that runs after a test tears down throws
// "getClientRects is not a function" and vitest counts it as an unhandled
// error even when every test passed. Empty geometry is enough for measure
// paths that only ever see real layout in a browser.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [];
  Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {
      return this;
    },
  });
}

// Node 22+ introduces an experimental global localStorage that throws or has undefined methods
// when --localstorage-file is not provided, shadowing jsdom's window.localStorage.
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  clear() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] ?? null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  get length() {
    return Object.keys(this.store).length;
  }
  key(index) {
    return Object.keys(this.store)[index] ?? null;
  }
}

if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== "function") {
  const mock = new LocalStorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      value: mock,
      writable: true,
      configurable: true,
    });
  }
}
