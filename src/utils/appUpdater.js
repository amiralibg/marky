import { check } from "@tauri-apps/plugin-updater";
import useUIStore from "../store/uiStore";

const isTauriRuntime = () => Boolean(window.__TAURI_INTERNALS__);

const getErrorMessage = (error) => {
  const message = error?.message || String(error || "Unknown updater error");
  if (/pubkey|signature|endpoint|updater/i.test(message)) {
    return "Auto-update is not fully configured for this build yet.";
  }
  return message;
};

export const checkForAppUpdate = async ({ silent = false } = {}) => {
  const { addNotification, setAppUpdate } = useUIStore.getState();

  if (!isTauriRuntime()) {
    return null;
  }

  setAppUpdate({
    status: "checking",
    message: "Checking for updates...",
    error: null,
    progress: null,
  });

  try {
    const update = await check();

    if (!update) {
      setAppUpdate({
        status: "idle",
        update: null,
        version: null,
        message: "Marky is up to date.",
        progress: null,
      });

      if (!silent) {
        addNotification("Marky is up to date.", "success", 3000);
      }

      return null;
    }

    const version = update.version || "new";
    setAppUpdate({
      status: "available",
      update,
      version,
      message: `Marky ${version} is available.`,
      progress: null,
      error: null,
    });

    addNotification(
      `Marky ${version} is available.`,
      "info",
      Infinity,
      {
        label: "Install",
        callback: () => installAppUpdate(update),
      },
      {
        title: "Update available",
      }
    );

    return update;
  } catch (error) {
    const message = getErrorMessage(error);
    setAppUpdate({
      status: "error",
      update: null,
      message,
      progress: null,
      error: message,
    });

    if (!silent) {
      addNotification(message, "error", 5000);
    }

    return null;
  }
};

export const installAppUpdate = async (providedUpdate = null) => {
  const { addNotification, removeNotification, setAppUpdate, updateNotification } =
    useUIStore.getState();
  const update = providedUpdate || useUIStore.getState().appUpdate.update;

  if (!update) {
    addNotification("No update is ready to install yet.", "error", 4000);
    return;
  }

  const progressNotificationId = addNotification(
    "Preparing update download...",
    "info",
    Infinity,
    null,
    {
      title: "Installing update",
      progress: 0,
      progressLabel: "Download progress",
    }
  );

  let downloaded = 0;
  let contentLength = 0;

  try {
    setAppUpdate({
      status: "downloading",
      message: "Downloading update...",
      progress: 0,
      error: null,
    });

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength = event.data?.contentLength || 0;
        downloaded = 0;
      }

      if (event.event === "Progress") {
        downloaded += event.data?.chunkLength || 0;
      }

      if (event.event === "Finished") {
        downloaded = contentLength || downloaded;
      }

      const progress = contentLength > 0 ? Math.min((downloaded / contentLength) * 100, 100) : 0;

      setAppUpdate({
        status: event.event === "Finished" ? "installing" : "downloading",
        message: event.event === "Finished" ? "Installing update..." : "Downloading update...",
        progress,
      });

      updateNotification(progressNotificationId, {
        message: event.event === "Finished" ? "Installing update..." : "Downloading update...",
        progress,
      });
    });

    setAppUpdate({
      status: "installed",
      message: "Update installed. Restart Marky to finish.",
      progress: 100,
    });

    updateNotification(progressNotificationId, {
      message: "Update installed. Restart Marky to finish.",
      type: "success",
      progress: 100,
      progressLabel: "Complete",
    });

    setTimeout(() => removeNotification(progressNotificationId), 8000);
  } catch (error) {
    const message = getErrorMessage(error);
    setAppUpdate({
      status: "error",
      message,
      progress: null,
      error: message,
    });

    updateNotification(progressNotificationId, {
      message,
      type: "error",
      progress: null,
    });
  }
};
