export const renderAndRevealWindow = (root, ui, appWindow, flushSync) => {
  flushSync(() => root.render(ui));
  appWindow?.show?.().catch(() => {});
};
