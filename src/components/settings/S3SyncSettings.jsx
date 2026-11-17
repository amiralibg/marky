import { useState } from "react";
import useNotesStore from "../../store/notesStore";
import useSettingsStore from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import { BusyButton, BusyDots } from "../ui/Loading";
import { testS3Connection, syncWorkspaceToS3 } from "../../utils/s3Sync";

const inputClass = "field";

const LAST_SYNC_STORAGE_KEY = "marky-s3-last-sync";

const loadLastSync = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_SYNC_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
};

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="mt-1.5 block text-[12px] text-text-muted">{hint}</span>}
  </label>
);

const ConnectionDot = ({ state }) => {
  const styles = {
    ok: "bg-green-500",
    error: "bg-danger",
    idle: "bg-text-muted/40",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${styles[state]}`} />;
};

/**
 * S3-compatible object storage sync — manual push/pull of the open workspace
 * against a user-configured endpoint and bucket. See utils/s3Sync.js.
 */
const S3SyncSettings = () => {
  const {
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3Prefix,
    s3AccessKeyId,
    s3SecretAccessKey,
    setS3Config,
  } = useSettingsStore();
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const ignorePatterns = useSettingsStore((state) => state.ignorePatterns);
  const { addNotification } = useUIStore();

  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [connection, setConnection] = useState(null); // {ok, objectCount, error}
  const [lastSync, setLastSync] = useState(loadLastSync);
  const [showSecret, setShowSecret] = useState(false);

  const config = {
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: s3Bucket,
    prefix: s3Prefix,
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey,
  };
  const hasCredentials = Boolean(s3Endpoint && s3Bucket && s3AccessKeyId && s3SecretAccessKey);
  const canSync = hasCredentials && Boolean(rootFolderPath);

  const connectionState = !hasCredentials
    ? "idle"
    : connection?.ok
      ? "ok"
      : connection
        ? "error"
        : "idle";

  const update = (key) => (event) => setS3Config({ [key]: event.target.value });

  const handleTest = async () => {
    setIsTesting(true);
    setConnection(null);
    try {
      const result = await testS3Connection(config);
      setConnection(result);
      if (result.ok) {
        addNotification(
          `Connected — ${result.objectCount} object${result.objectCount !== 1 ? "s" : ""} under ${
            s3Prefix || "bucket root"
          }`,
          "success"
        );
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setProgress(null);
    try {
      const result = await syncWorkspaceToS3(config, {
        rootFolderPath,
        ignorePatterns: ignorePatterns
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        onProgress: setProgress,
      });
      const record = { time: Date.now(), ...result };
      setLastSync(record);
      try {
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify(record));
      } catch {
        // Status history is cosmetic; never fail a sync over it.
      }
      addNotification(
        `Sync complete — ${result.pushed} uploaded, ${result.pulled} downloaded`,
        "success",
        5000
      );
      // Pulled notes need to reach the sidebar and any open tabs.
      if (result.pulled > 0) {
        await useNotesStore.getState().refreshRootFromDisk({ preserveSelection: true });
      }
    } catch (err) {
      console.error("S3 sync failed:", err);
      addNotification("Sync failed: " + err.message, "error", 6000);
    } finally {
      setIsSyncing(false);
      setProgress(null);
    }
  };

  const formatTime = (ms) =>
    new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="rounded-card bg-item-hover p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ConnectionDot state={connectionState} />
            <span className="text-sm font-medium text-text-primary">
              {!hasCredentials
                ? "Not configured"
                : connection?.ok
                  ? "Connected"
                  : connection
                    ? "Connection failed"
                    : "Credentials saved — not verified"}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1 truncate">
            {lastSync
              ? `Last synced ${formatTime(lastSync.time)} • ${lastSync.pushed} uploaded • ${lastSync.pulled} downloaded • ${lastSync.skipped} unchanged`
              : rootFolderPath
                ? `Ready to sync the open workspace.`
                : "Open a workspace to enable syncing."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BusyButton
            onClick={handleTest}
            busy={isTesting}
            disabled={!hasCredentials}
            title={hasCredentials ? undefined : "Fill in endpoint, bucket and keys first"}
            className={`px-3.5 py-2 rounded-control font-medium text-xs transition-all flex items-center gap-2 border ${
              !hasCredentials || isTesting
                ? "bg-overlay-light text-text-muted cursor-not-allowed border-overlay-subtle"
                : "bg-bg-editor hover:bg-overlay-light text-text-primary border-border"
            }`}
          >
            Test
          </BusyButton>
          <BusyButton
            onClick={handleSync}
            busy={isSyncing}
            disabled={!canSync}
            title={!rootFolderPath ? "Open a workspace first" : undefined}
            className="btn btn-primary"
            icon={
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            }
          >
            Sync now
          </BusyButton>
        </div>
      </div>

      {isSyncing && progress && (
        <div className="flex items-center gap-2 px-1 text-text-muted" role="status">
          <BusyDots />
          <span className="text-[11px] truncate font-mono">{progress}</span>
        </div>
      )}

      {connection && !connection.ok && (
        <p className="text-xs text-danger px-1">Test failed: {connection.error}</p>
      )}

      {/* Credentials */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-text-muted">Connection details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field
              label="Endpoint URL"
              hint="Any S3-compatible service: AWS (https://s3.us-east-1.amazonaws.com), MinIO, Backblaze B2, Wasabi, Hetzner…"
            >
              <input
                type="text"
                value={s3Endpoint}
                onChange={update("s3Endpoint")}
                placeholder="https://s3.us-east-1.amazonaws.com"
                className={inputClass}
                spellCheck={false}
              />
            </Field>
          </div>
          <Field label="Bucket">
            <input
              type="text"
              value={s3Bucket}
              onChange={update("s3Bucket")}
              placeholder="my-notes"
              className={inputClass}
              spellCheck={false}
            />
          </Field>
          <Field label="Region">
            <input
              type="text"
              value={s3Region}
              onChange={update("s3Region")}
              placeholder="us-east-1"
              className={inputClass}
              spellCheck={false}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Prefix (optional)"
              hint="Limits the sync to one folder inside the bucket."
            >
              <input
                type="text"
                value={s3Prefix}
                onChange={update("s3Prefix")}
                placeholder="marky/my-vault/"
                className={inputClass}
                spellCheck={false}
              />
            </Field>
          </div>
          <Field label="Access key ID">
            <input
              type="text"
              value={s3AccessKeyId}
              onChange={update("s3AccessKeyId")}
              className={`${inputClass} font-mono`}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field label="Secret access key">
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={s3SecretAccessKey}
                onChange={update("s3SecretAccessKey")}
                className={`${inputClass} font-mono pr-12`}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-text-muted hover:text-text-primary"
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-text-muted">How sync works</h3>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-text-muted list-disc list-inside">
          <li>Manual only — nothing leaves your disk until you press Sync now.</li>
          <li>Last-write-wins per file, based on modification time.</li>
          <li>Deleting a note never deletes it on the other side — files are removed nowhere.</li>
          <li>Credentials live in this workspace's settings profile, on this device only.</li>
        </ul>
      </section>
    </div>
  );
};

export default S3SyncSettings;
