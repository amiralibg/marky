import useSettingsStore from "../../store/settingsStore";
import useNotesStore from "../../store/notesStore";
import { isGitConfigured } from "../../utils/gitSync";
import { isS3Configured } from "../../utils/s3Sync";
import { useAutoSyncStatus } from "../../utils/autoSyncRunner";

const INTERVALS = [5, 15, 30, 60, 180];

const Toggle = ({ checked, onChange, disabled, label, hint }) => (
  <label
    className={`flex items-start justify-between gap-4 py-2.5 ${
      disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
    }`}
  >
    <span className="min-w-0">
      <span className="block text-sm text-text-primary">{label}</span>
      {hint && <span className="block text-[11px] text-text-muted mt-0.5">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors relative ${
        checked ? "bg-accent" : "bg-overlay-light"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  </label>
);

const STATE_COPY = {
  idle: { dot: "bg-green-500", text: "Up to date" },
  syncing: { dot: "bg-accent animate-pulse", text: "Syncing…" },
  error: { dot: "bg-amber-400", text: "Retrying after an error" },
  paused: { dot: "bg-red-400", text: "Paused after repeated failures" },
  offline: { dot: "bg-text-muted/40", text: "Waiting for a connection" },
  off: { dot: "bg-text-muted/40", text: "Auto-sync is off" },
};

/**
 * Auto-sync controls, shared by every backend.
 *
 * One scheduler drives them all (see `utils/autoSync.js`), so this panel is
 * where the cadence lives rather than duplicating a copy of it inside the S3
 * and git sections.
 */
const AutoSyncSettings = () => {
  const settings = useSettingsStore();
  const { setAutoSyncConfig } = settings;
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const status = useAutoSyncStatus();

  const backends = settings.autoSyncBackends || [];
  const gitReady = isGitConfigured(settings);
  const s3Ready = isS3Configured({
    endpoint: settings.s3Endpoint,
    bucket: settings.s3Bucket,
    accessKeyId: settings.s3AccessKeyId,
    secretAccessKey: settings.s3SecretAccessKey,
  });
  const anyReady = (backends.includes("git") && gitReady) || (backends.includes("s3") && s3Ready);

  const toggleBackend = (id) => (on) =>
    setAutoSyncConfig({
      autoSyncBackends: on ? [...new Set([...backends, id])] : backends.filter((b) => b !== id),
    });

  const state = !settings.autoSyncEnabled ? "off" : (status?.state ?? "idle");
  const copy = STATE_COPY[state] ?? STATE_COPY.idle;

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className="rounded-xl border border-border bg-overlay-subtle/50 p-4">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${copy.dot}`} />
          <span className="text-sm font-medium text-text-primary">{copy.text}</span>
        </div>
        <p className="text-xs text-text-muted mt-1">
          {status?.lastError
            ? status.lastError
            : status?.lastSyncAt
              ? `Last synced ${new Date(status.lastSyncAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Nothing synced yet this session."}
        </p>
        {settings.autoSyncEnabled && !anyReady && (
          <p className="text-[11px] text-amber-400 mt-2">
            Nothing to sync with yet — finish setting up git or S3 sync first.
          </p>
        )}
        {!rootFolderPath && (
          <p className="text-[11px] text-amber-400 mt-2">Open a workspace to enable auto-sync.</p>
        )}
      </div>

      <div className="divide-y divide-border/60">
        <Toggle
          label="Sync automatically"
          hint="Runs in the background so you never have to think about it."
          checked={settings.autoSyncEnabled}
          onChange={(on) => setAutoSyncConfig({ autoSyncEnabled: on })}
        />

        <Toggle
          label="Git"
          hint={gitReady ? "Commit, merge and push on every sync." : "Not configured yet."}
          checked={backends.includes("git")}
          onChange={toggleBackend("git")}
          disabled={!settings.autoSyncEnabled}
        />

        <Toggle
          label="S3 storage"
          hint={s3Ready ? "Upload and download changed notes." : "Not configured yet."}
          checked={backends.includes("s3")}
          onChange={toggleBackend("s3")}
          disabled={!settings.autoSyncEnabled}
        />

        <Toggle
          label="After you stop typing"
          hint="Waits for a pause in your writing, then syncs once — not once per save."
          checked={settings.autoSyncOnSave}
          onChange={(on) => setAutoSyncConfig({ autoSyncOnSave: on })}
          disabled={!settings.autoSyncEnabled}
        />

        <Toggle
          label="When Marky regains focus"
          hint="Picks up edits made on another device while you were away."
          checked={settings.autoSyncOnFocus}
          onChange={(on) => setAutoSyncConfig({ autoSyncOnFocus: on })}
          disabled={!settings.autoSyncEnabled}
        />
      </div>

      {/* Interval */}
      <div className={settings.autoSyncEnabled ? "" : "opacity-40 pointer-events-none"}>
        <span className="block text-xs font-medium text-text-secondary mb-2">Also sync every</span>
        <div className="flex flex-wrap gap-2">
          {INTERVALS.map((minutes) => {
            const active = settings.autoSyncIntervalMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                onClick={() => setAutoSyncConfig({ autoSyncIntervalMinutes: minutes })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? "bg-accent/15 border-accent/50 text-accent"
                    : "bg-overlay-subtle border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
              </button>
            );
          })}
        </div>
      </div>

      <details>
        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors">
          How auto-sync behaves
        </summary>
        <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-text-muted list-disc list-inside">
          <li>Only one sync runs at a time; anything requested during one is folded into it.</li>
          <li>
            Being offline is not a failure — it waits, and syncs as soon as the connection is back.
          </li>
          <li>
            After a real error it retries on a widening delay, and stops after five in a row rather
            than hammering a remote that is rejecting it.
          </li>
          <li>&ldquo;Sync now&rdquo; always runs, whatever the schedule is doing.</li>
        </ul>
      </details>
    </div>
  );
};

export default AutoSyncSettings;
