import { useCallback, useEffect, useRef, useState } from "react";
import useNotesStore from "../../store/notesStore";
import useSettingsStore from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import {
  getGitStatus,
  getGitAvailability,
  initGitRepo,
  testGitRemote,
  syncWorkspaceToGit,
  resetToRemote,
  describeSyncReport,
} from "../../utils/gitSync";

const inputClass =
  "w-full px-3 py-1.5 rounded-lg bg-overlay-subtle border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent";

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-text-secondary mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-text-muted mt-1">{hint}</span>}
  </label>
);

const StateDot = ({ state }) => {
  const styles = {
    ok: "bg-green-500",
    error: "bg-red-400",
    warn: "bg-amber-400",
    idle: "bg-text-muted/40",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${styles[state]}`} />;
};

const SectionTitle = ({ children }) => (
  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{children}</h3>
);

const AUTH_MODES = [
  { id: "token", label: "Access token", hint: "HTTPS remote with a personal access token" },
  { id: "ssh-agent", label: "SSH agent", hint: "Uses the keys already loaded in your agent" },
  { id: "ssh-key", label: "SSH key file", hint: "Point at a private key on disk" },
];

const ChevronDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M6 9l6 6 6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Custom dropdown standing in for the platform `<select>` — the native popup
 * can't be styled and clashes with the rest of the settings form.
 */
const CustomSelect = ({ value, onChange, options, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-bg-editor shadow-lg shadow-black/20 py-1 overflow-hidden"
        >
          {options.map((option) => {
            const isSelected = option.id === value;
            return (
              <li key={option.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${
                    isSelected
                      ? "bg-accent/10 text-accent"
                      : "text-text-primary hover:bg-overlay-light"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * Git sync — the vault as a git repository, backed up to any remote.
 *
 * The panel deliberately shows repository state (branch, ahead/behind, last
 * commit) rather than hiding it: the whole reason to sync with git instead of
 * object storage is that the history is real and inspectable. See
 * `utils/gitSync.js` and `src-tauri/src/git_sync.rs`.
 */
const GitSyncSettings = () => {
  const settings = useSettingsStore();
  const { setGitConfig } = settings;
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const { addNotification } = useUIStore();

  const [status, setStatus] = useState(null);
  const [isBusy, setIsBusy] = useState(null); // 'test' | 'sync' | 'init' | 'reset'
  const [probe, setProbe] = useState(null); // {ok, refs, error}
  const [showSecret, setShowSecret] = useState(false);
  const [gitVersion, setGitVersion] = useState(undefined); // undefined = still checking

  useEffect(() => {
    let cancelled = false;
    getGitAvailability()
      .then((version) => {
        if (!cancelled) setGitVersion(version);
      })
      .catch(() => {
        if (!cancelled) setGitVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!rootFolderPath) return setStatus(null);
    try {
      setStatus(await getGitStatus(rootFolderPath));
    } catch {
      // A status read is informational; never surface it as a failure.
      setStatus(null);
    }
  }, [rootFolderPath]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const runTask = async (name, task, successMessage) => {
    setIsBusy(name);
    try {
      const result = await task();
      if (successMessage) addNotification(successMessage(result), "success", 5000);
      await refreshStatus();
      return result;
    } catch (error) {
      addNotification(String(error?.message || error), "error", 7000);
      return null;
    } finally {
      setIsBusy(null);
    }
  };

  const handleTest = async () => {
    setProbe(null);
    setIsBusy("test");
    try {
      const refs = await testGitRemote(settings.gitRemoteUrl, settings);
      setProbe({ ok: true, refs });
      addNotification(`Connected — ${refs} ref${refs === 1 ? "" : "s"} on the remote`, "success");
    } catch (error) {
      setProbe({ ok: false, error: String(error?.message || error) });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSetUp = () =>
    runTask(
      "init",
      () => initGitRepo(rootFolderPath, settings.gitRemoteUrl, settings.gitBranch),
      () => "This vault is now a git repository"
    );

  const handleSync = () =>
    runTask(
      "sync",
      async () => {
        const report = await syncWorkspaceToGit(rootFolderPath, settings, {
          changedCount: status?.dirty || 1,
        });
        // Anything the merge brought down has to reach the sidebar and tabs.
        if (report?.changedWorkingTree) {
          await useNotesStore.getState().refreshRootFromDisk({ preserveSelection: true });
        }
        return report;
      },
      describeSyncReport
    );

  const handleReset = async () => {
    const ok = window.confirm(
      "Discard every local change in this vault and match the remote exactly?\n\n" +
        "Notes that exist only on this device will be lost. This cannot be undone."
    );
    if (!ok) return;
    await runTask(
      "reset",
      async () => {
        const next = await resetToRemote(rootFolderPath, settings);
        await useNotesStore.getState().refreshRootFromDisk({ preserveSelection: true });
        return next;
      },
      () => "Vault reset to match the remote"
    );
  };

  const update = (key) => (event) => setGitConfig({ [key]: event.target.value });

  const isRepo = status?.isRepo && status?.isRepoRoot;
  const nestedWarning = status?.isRepo && !status?.isRepoRoot;

  const headline = !rootFolderPath
    ? "Open a workspace to enable git sync"
    : nestedWarning
      ? "This folder sits inside another git repository"
      : !isRepo
        ? "Not set up yet"
        : status?.conflicted
          ? "An unresolved merge is blocking sync"
          : `On ${status.branch || "?"}${status.ahead ? ` • ${status.ahead} to push` : ""}${
              status.behind ? ` • ${status.behind} to pull` : ""
            }${status.dirty ? ` • ${status.dirty} changed` : ""}`;

  const dotState =
    nestedWarning || status?.conflicted
      ? "error"
      : !isRepo
        ? "idle"
        : status.dirty || status.ahead || status.behind
          ? "warn"
          : "ok";

  // Git is not bundled — sync shells out to the system binary. Without it the
  // feature simply does not exist on this machine.
  if (gitVersion === null) {
    return (
      <div className="rounded-xl border border-border bg-overlay-subtle/50 p-4 space-y-2">
        <p className="text-sm font-medium text-text-primary">Git is not installed</p>
        <p className="text-xs text-text-muted leading-relaxed">
          Marky syncs through your system&apos;s git — nothing is bundled, keeping the app small.
          Install git, restart Marky, and this section will come alive.
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          macOS: <code className="font-mono">xcode-select --install</code> or{" "}
          <code className="font-mono">brew install git</code> · Linux:{" "}
          <code className="font-mono">apt install git</code> · Windows:{" "}
          <a
            href="https://git-scm.com/download/windows"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            git-scm.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="rounded-xl border border-border bg-overlay-subtle/50 p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StateDot state={dotState} />
            <span className="text-sm font-medium text-text-primary truncate">{headline}</span>
          </div>
          <p className="text-xs text-text-muted mt-1 truncate">
            {status?.lastCommit
              ? `Last commit "${status.lastCommit.summary}" — ${new Date(
                  status.lastCommit.time * 1000
                ).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "No commits yet."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isRepo ? (
            <button
              onClick={handleSync}
              disabled={!rootFolderPath || Boolean(isBusy) || status?.conflicted}
              className={`px-4 py-2 rounded-lg font-medium text-xs transition-all ${
                !rootFolderPath || isBusy || status?.conflicted
                  ? "bg-overlay-light text-text-muted cursor-not-allowed"
                  : "bg-accent hover:bg-accent/80 text-white shadow-sm shadow-accent/20"
              }`}
            >
              {isBusy === "sync" ? "Syncing…" : "Sync now"}
            </button>
          ) : (
            <button
              onClick={handleSetUp}
              disabled={!rootFolderPath || !settings.gitRemoteUrl || Boolean(isBusy)}
              title={settings.gitRemoteUrl ? undefined : "Add a remote URL first"}
              className={`px-4 py-2 rounded-lg font-medium text-xs transition-all ${
                !rootFolderPath || !settings.gitRemoteUrl || isBusy
                  ? "bg-overlay-light text-text-muted cursor-not-allowed"
                  : "bg-accent hover:bg-accent/80 text-white shadow-sm shadow-accent/20"
              }`}
            >
              {isBusy === "init" ? "Setting up…" : "Set up git sync"}
            </button>
          )}
        </div>
      </div>

      {nestedWarning && (
        <p className="text-xs text-amber-400 px-1">
          Syncing here would commit the parent repository, not just your notes. Move the vault
          outside it, or sync that repository with git directly.
        </p>
      )}

      {status?.conflicted && (
        <p className="text-xs text-red-400 px-1">
          A merge started outside Marky is still unresolved. Finish or abort it in git, then sync
          again.
        </p>
      )}

      {/* Remote */}
      <section className="space-y-4">
        <SectionTitle>Remote and credentials</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field
              label="Remote URL"
              hint="Any git host — GitHub, GitLab, Gitea, or a bare repo you own."
            >
              <input
                type="text"
                value={settings.gitRemoteUrl}
                onChange={update("gitRemoteUrl")}
                placeholder="https://github.com/you/notes.git"
                className={`${inputClass} font-mono text-xs`}
                spellCheck={false}
              />
            </Field>
          </div>

          <Field label="Branch">
            <input
              type="text"
              value={settings.gitBranch}
              onChange={update("gitBranch")}
              placeholder="main"
              className={inputClass}
              spellCheck={false}
            />
          </Field>

          <Field label="Authentication">
            <CustomSelect
              ariaLabel="Authentication"
              value={settings.gitAuthMode}
              onChange={(id) => setGitConfig({ gitAuthMode: id })}
              options={AUTH_MODES}
            />
          </Field>

          {settings.gitAuthMode === "token" && (
            <>
              <Field label="Username" hint="Optional on GitHub; required by some hosts.">
                <input
                  type="text"
                  value={settings.gitUsername}
                  onChange={update("gitUsername")}
                  className={inputClass}
                  spellCheck={false}
                  autoComplete="off"
                />
              </Field>
              <Field label="Access token" hint="Needs repository read and write scope.">
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={settings.gitToken}
                    onChange={update("gitToken")}
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
            </>
          )}

          {settings.gitAuthMode === "ssh-key" && (
            <>
              <Field label="Private key path">
                <input
                  type="text"
                  value={settings.gitSshKeyPath}
                  onChange={update("gitSshKeyPath")}
                  placeholder="~/.ssh/id_ed25519"
                  className={`${inputClass} font-mono text-xs`}
                  spellCheck={false}
                />
              </Field>
              <Field label="Passphrase" hint="Leave empty for an unencrypted key.">
                <input
                  type="password"
                  value={settings.gitSshPassphrase}
                  onChange={update("gitSshPassphrase")}
                  className={`${inputClass} font-mono`}
                  autoComplete="off"
                />
              </Field>
            </>
          )}

          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={!settings.gitRemoteUrl || Boolean(isBusy)}
              className={`px-3.5 py-2 rounded-lg font-medium text-xs transition-all border ${
                !settings.gitRemoteUrl || isBusy
                  ? "bg-overlay-light text-text-muted cursor-not-allowed border-overlay-subtle"
                  : "bg-bg-editor hover:bg-overlay-light text-text-primary border-border"
              }`}
            >
              {isBusy === "test" ? "Testing…" : "Test connection"}
            </button>
            {probe?.ok && (
              <span className="text-xs text-green-500">Reached the remote ({probe.refs} refs)</span>
            )}
            {probe && !probe.ok && <span className="text-xs text-red-400">{probe.error}</span>}
          </div>
        </div>
      </section>

      {/* Commit identity */}
      <section className="space-y-4">
        <SectionTitle>Commit identity</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" hint="Falls back to your git config, then to “Marky”.">
            <input
              type="text"
              value={settings.gitAuthorName}
              onChange={update("gitAuthorName")}
              className={inputClass}
              spellCheck={false}
            />
          </Field>
          <Field label="Email">
            <input
              type="text"
              value={settings.gitAuthorEmail}
              onChange={update("gitAuthorEmail")}
              className={inputClass}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-2">
        <SectionTitle>How git sync works</SectionTitle>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-text-muted list-disc list-inside">
          <li>Each sync commits your changes, merges the remote, then pushes.</li>
          <li>
            A note edited on two devices keeps both versions — yours stays put, theirs lands beside
            it as “Note (conflict …).md”. You will never see conflict markers.
          </li>
          <li>Syncs through your system git — no extra copy is bundled with Marky.</li>
          <li>Credentials live in this workspace&apos;s settings profile, on this device only.</li>
          <li>Your vault stays an ordinary repository you can clone, inspect, or push by hand.</li>
        </ul>
      </section>

      {/* Danger zone */}
      {isRepo && (
        <section className="space-y-3">
          <SectionTitle>Reset</SectionTitle>
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11px] text-text-muted leading-relaxed">
              Throw away every local change and match the remote exactly. Useful when a vault has
              drifted too far to merge — and destructive, so it asks first.
            </p>
            <button
              onClick={handleReset}
              disabled={Boolean(isBusy)}
              className="shrink-0 px-3.5 py-2 rounded-lg font-medium text-xs border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
            >
              {isBusy === "reset" ? "Resetting…" : "Reset to remote"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default GitSyncSettings;
