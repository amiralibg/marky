/**
 * Which desktop the app is running on.
 *
 * The window chrome differs per platform — macOS keeps its native frame and
 * overlay traffic lights, Windows and Linux draw Marky's own title bar over an
 * undecorated window — so several components need the same answer. Detection
 * lives here rather than in each of them so they can't drift apart.
 *
 * The WebView user agent is the only signal available without the OS plugin.
 */
export const detectPlatform = () => {
  const userAgent = navigator.userAgent?.toLowerCase() ?? "";
  const platform = navigator.platform?.toLowerCase() ?? "";

  // Android reports "linux" in both strings, so it has to be ruled out first.
  if (userAgent.includes("android")) return "android";
  if (userAgent.includes("win") || platform.includes("win")) return "windows";
  if (userAgent.includes("mac") || platform.includes("mac")) return "macos";
  if (userAgent.includes("linux") || platform.includes("linux")) return "linux";
  return "unknown";
};

/**
 * Publish the platform on `<html data-platform>` so stylesheets can key off it
 * without every component threading the value down.
 */
export const applyPlatformAttribute = () => {
  const platform = detectPlatform();
  document.documentElement.dataset.platform = platform;
  return platform;
};
