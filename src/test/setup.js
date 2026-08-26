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
