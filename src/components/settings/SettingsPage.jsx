import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import Fuse from "fuse.js";
import ConfirmDialog from "../modals/ConfirmDialog";
import AppearanceSettings from "./AppearanceSettings";
import EditorSettings from "./EditorSettings";
import KeymapsSettings from "./KeymapsSettings";
import ScheduledNotesManager from "./ScheduledNotesManager";
import TagManager from "./TagManager";
import McpSettings from "./McpSettings";
import S3SyncSettings from "./S3SyncSettings";
import GitSyncSettings from "./GitSyncSettings";
import AutoSyncSettings from "./AutoSyncSettings";
import useNotesStore from "../../store/notesStore";
import useSettingsStore from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import {
  exportWorkspaceAsZip,
  restoreWorkspaceFromZip,
  exportSettingsAsJson,
  importSettingsFromJson,
} from "../../utils/backup";
import { checkForAppUpdate, installAppUpdate, restartApp } from "../../utils/appUpdater";
import { UpdateIcon } from "../icons/AppUpdateIcon";
import { BusyButton } from "../ui/Loading";

const BatchExportModal = lazy(() => import("../modals/BatchExportModal"));

const normalizeWorkspacePath = (value) => (value ? value.replace(/\\/g, "/") : "");

const SectionHeader = ({ title, description }) => (
  <header>
    <h2 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-text-primary">
      {title}
    </h2>
    <p className="mt-1.5 text-[14px] leading-relaxed text-text-secondary">{description}</p>
  </header>
);

const svg = (d, extra = null) => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={d} />
    {extra}
  </svg>
);

const ICONS = {
  appearance: svg(
    "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
  ),
  editor: svg(
    "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
  ),
  shortcuts: svg(
    "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
  ),
  scheduling: svg("M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"),
  tags: svg(
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
  ),
  workspace: svg("M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"),
  sync: svg(
    "M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
  ),
  updates: <UpdateIcon />,
  backup: svg("M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"),
  batch: svg(
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
  ),
  portability: svg(
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  ),
  mcp: svg("M13 10V3L4 14h7v7l9-11h-7z"),
  git: svg(
    "M6 3v12m0 0a3 3 0 103 3m-3-3a3 3 0 113-3m0 0h6a3 3 0 003-3V6m0 0a3 3 0 100-3 3 3 0 000 3z"
  ),
  autosync: svg("M12 8v4l2 2m6-2a8 8 0 11-16 0 8 8 0 0116 0z"),
};

/**
 * Section metadata lives here; the bodies render one at a time below.
 * `keywords` feed the settings search — anything a user might type to find a
 * setting that isn't in the section's name.
 */
const SECTIONS = [
  {
    id: "appearance",
    label: "Appearance",
    icon: ICONS.appearance,
    description: "Personalize the look of your workspace.",
    keywords: "theme dark light accent color font size density sidebar",
    Content: AppearanceSettings,
  },
  {
    id: "editor",
    label: "Editor",
    icon: ICONS.editor,
    description: "Configure editor behavior and keybindings.",
    keywords: "vim autosave save typewriter line numbers width live preview frontmatter",
    Content: EditorSettings,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: ICONS.shortcuts,
    description: "Configure keyboard shortcuts for quick actions.",
    keywords: "keymap key bindings hotkeys keyboard command",
    Content: ({ onOpenKeymapsModal }) => (
      <KeymapsSettings onOpenKeymapsModal={onOpenKeymapsModal} />
    ),
  },
  {
    id: "scheduling",
    label: "Scheduling",
    icon: ICONS.scheduling,
    description: "View and manage recurring note creation.",
    keywords: "daily recurring scheduled notes cron",
    Content: ScheduledNotesManager,
  },
  {
    id: "tags",
    label: "Tags",
    icon: ICONS.tags,
    description: "Rename, merge, or delete hashtags across your workspace.",
    keywords: "hashtags rename merge delete tag manager",
    Content: TagManager,
  },
  {
    id: "sync",
    label: "Cloud sync",
    icon: ICONS.sync,
    description: "Keep notes in sync across devices with your own S3-compatible storage.",
    keywords: "s3 sync backup cloud minio backblaze wasabi aws bucket remote storage",
    Content: S3SyncSettings,
  },
  {
    id: "git",
    label: "Git sync",
    icon: ICONS.git,
    description: "Back the vault up to a git remote, with real history you can inspect.",
    keywords:
      "git github gitlab gitea repository commit push pull clone branch version history remote ssh token backup sync",
    Content: GitSyncSettings,
  },
  {
    id: "autosync",
    label: "Auto-sync",
    icon: ICONS.autosync,
    description: "Choose when Marky syncs on its own.",
    keywords: "auto automatic background interval schedule sync on save focus offline retry",
    Content: AutoSyncSettings,
  },
  {
    id: "workspace",
    label: "Workspace",
    icon: ICONS.workspace,
    description: "Control how Marky handles your workspace on launch.",
    keywords: "startup folder profile per-workspace reopen recent vault",
    Content: WorkspaceSectionContent,
  },
  {
    id: "updates",
    label: "Updates",
    icon: ICONS.updates,
    description: "Check for Marky releases and install updates in-app.",
    keywords: "version upgrade release updater check install restart",
    Content: UpdatesSectionContent,
  },
  {
    id: "backup",
    label: "Backup",
    icon: ICONS.backup,
    description: "Export your workspace as a zip archive.",
    keywords: "zip archive export restore save copy",
    Content: BackupSectionContent,
  },
  {
    id: "batch",
    label: "Batch export",
    icon: ICONS.batch,
    description: "Export multiple notes at once as Markdown or HTML files.",
    keywords: "zip html markdown download multiple notes export all",
    Content: BatchExportSectionContent,
  },
  {
    id: "portability",
    label: "Sync settings",
    icon: ICONS.portability,
    description:
      "Export your preferences and keyboard shortcuts, or restore them from a previous export.",
    keywords: "json import export transfer preferences portability move machines",
    Content: PortabilitySectionContent,
  },
  {
    id: "mcp",
    label: "AI & MCP",
    icon: ICONS.mcp,
    description: "Expose your Marky workspace to Claude Desktop, Cursor, and other AI agents.",
    keywords: "ai claude cursor agents model context protocol llm integration",
    Content: McpSettings,
  },
];

// The remaining sections need store access / local state, so their bodies are
// small components rather than plain elements.

const Toggle = ({ checked, onChange, disabled, label }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    aria-checked={checked}
    aria-label={label}
    role="switch"
    className="switch"
  ></button>
);

function WorkspaceSectionContent() {
  const {
    openRecentOnStartup,
    setOpenRecentOnStartup,
    workspaceProfiles,
    setWorkspaceSettingsEnabled,
  } = useSettingsStore();
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const currentWorkspaceName = rootFolderPath
    ? normalizeWorkspacePath(rootFolderPath).split("/").filter(Boolean).pop()
    : null;
  const hasWorkspaceProfile = rootFolderPath
    ? Boolean(workspaceProfiles[normalizeWorkspacePath(rootFolderPath)])
    : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13.5px] font-semibold text-text-primary">
            Reopen last workspace on startup
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
            Automatically load the most recently used folder when Marky launches.
          </p>
        </div>
        <Toggle
          checked={openRecentOnStartup}
          onChange={() => setOpenRecentOnStartup(!openRecentOnStartup)}
          label="Reopen last workspace on startup"
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-[13.5px] font-semibold text-text-primary">
            Workspace-specific settings profile
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
            {rootFolderPath
              ? `Keep theme, editor behavior, and keymaps specific to ${currentWorkspaceName}.`
              : "Open a workspace to create a per-workspace settings profile."}
          </p>
        </div>
        <Toggle
          checked={hasWorkspaceProfile}
          disabled={!rootFolderPath}
          onChange={() =>
            rootFolderPath && setWorkspaceSettingsEnabled(rootFolderPath, !hasWorkspaceProfile)
          }
          label="Use workspace-specific settings profile"
        />
      </div>
    </div>
  );
}

function UpdatesSectionContent() {
  const appUpdate = useUIStore((state) => state.appUpdate);
  const isCheckingForUpdates = appUpdate.status === "checking";
  const isUpdating = ["downloading", "installing"].includes(appUpdate.status);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13.5px] text-text-primary">
          {appUpdate.message || "Marky checks for updates automatically in production builds."}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
          When an update is available, it also appears as a toast and in the sidebar.
        </p>
        {typeof appUpdate.progress === "number" && (
          <div className="mt-3 max-w-sm">
            <div className="h-1.5 rounded-full bg-overlay-light overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, appUpdate.progress))}%` }}
              />
            </div>
            <div className="mt-1 text-end text-[11px] text-text-muted">
              {Math.round(appUpdate.progress)}%
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {appUpdate.status === "available" && (
          <button onClick={() => installAppUpdate()} className="btn btn-primary">
            Download and install
          </button>
        )}
        {appUpdate.status === "installed" && (
          <button onClick={restartApp} className="btn btn-primary">
            Restart Marky
          </button>
        )}
        <BusyButton
          onClick={() => checkForAppUpdate({ silent: false })}
          busy={isCheckingForUpdates}
          disabled={isUpdating}
          icon={<UpdateIcon className="w-4 h-4" />}
          className="btn"
        >
          Check for updates
        </BusyButton>
      </div>
    </div>
  );
}

function BackupSectionContent() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const handleBackup = async () => {
    const { rootFolderPath, items } = useNotesStore.getState();
    const settings = useSettingsStore.getState();
    const { addNotification } = useUIStore.getState();

    if (!rootFolderPath) {
      addNotification("No workspace folder is open", "warning");
      return;
    }

    setIsBackingUp(true);
    try {
      const path = await exportWorkspaceAsZip(rootFolderPath, items, {
        themeId: settings.themeId,
        accentColorId: settings.accentColorId,
        vimMode: settings.vimMode,
      });
      if (path) {
        addNotification("Workspace backup saved", "success");
      }
    } catch (err) {
      console.error("Backup failed:", err);
      addNotification("Backup failed: " + err.message, "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  const executeRestore = async (overwriteExisting) => {
    setShowRestoreConfirm(false);
    const { addNotification } = useUIStore.getState();

    setIsRestoringBackup(true);
    try {
      const result = await restoreWorkspaceFromZip({ overwriteExisting });
      if (!result) return;

      const { targetFolderPath, writtenCount, skippedExistingCount, skippedUnsafeCount, manifest } =
        result;

      const parts = [`Restored ${writtenCount} file${writtenCount !== 1 ? "s" : ""}`];
      if (skippedExistingCount > 0) {
        parts.push(`skipped ${skippedExistingCount} existing`);
      }
      if (skippedUnsafeCount > 0) {
        parts.push(
          `ignored ${skippedUnsafeCount} unsafe path${skippedUnsafeCount !== 1 ? "s" : ""}`
        );
      }

      addNotification(parts.join(" • "), "success", 5000);

      // If restored into the currently open workspace, refresh the tree.
      const state = useNotesStore.getState();
      const currentRoot = state.rootFolderPath;
      const normalize = (p) => (p ? p.replace(/\\/g, "/").replace(/\/+$/, "") : "");
      if (normalize(currentRoot) && normalize(currentRoot) === normalize(targetFolderPath)) {
        await state.refreshRootFromDisk({ preserveSelection: true });
        addNotification("Current workspace refreshed after restore", "info", 3000);
      } else if (manifest?.noteCount) {
        addNotification(
          `Backup manifest: ${manifest.noteCount} note${manifest.noteCount !== 1 ? "s" : ""}`,
          "info",
          3500
        );
      }
    } catch (err) {
      console.error("Restore failed:", err);
      addNotification("Restore failed: " + err.message, "error", 5000);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13.5px] text-text-primary">
            Export all notes and folder structure as a .zip file.
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            Includes settings and workspace metadata. You can also restore a backup into any folder.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BusyButton
            onClick={() => setShowRestoreConfirm(true)}
            busy={isRestoringBackup}
            disabled={isBackingUp}
            className="btn"
          >
            Restore backup
          </BusyButton>

          <BusyButton
            onClick={handleBackup}
            busy={isBackingUp}
            disabled={isRestoringBackup}
            className="btn btn-primary"
          >
            Export backup
          </BusyButton>
        </div>
      </div>
      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="Overwrite existing files?"
        message="Overwrite files if they already exist in the destination folder? Choose Cancel to skip existing files (safer default)."
        confirmLabel="Overwrite"
        cancelLabel="Skip existing"
        variant="warning"
        onConfirm={() => executeRestore(true)}
        onCancel={() => executeRestore(false)}
      />
    </>
  );
}

function BatchExportSectionContent() {
  const [showBatchExport, setShowBatchExport] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13.5px] text-text-primary">
            Choose a selection of notes (or all notes) and download them as a ZIP.
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            Folder structure is preserved inside the archive.
          </p>
        </div>
        <button onClick={() => setShowBatchExport(true)} className="btn btn-primary">
          Batch export
        </button>
      </div>
      <Suspense fallback={null}>
        {showBatchExport && (
          <BatchExportModal isOpen={showBatchExport} onClose={() => setShowBatchExport(false)} />
        )}
      </Suspense>
    </>
  );
}

function PortabilitySectionContent() {
  const [isExportingSettings, setIsExportingSettings] = useState(false);
  const [isImportingSettings, setIsImportingSettings] = useState(false);
  const { getSettingsExportPayload, importSettingsPayload } = useSettingsStore();

  const handleExportSettings = async () => {
    const { addNotification } = useUIStore.getState();

    setIsExportingSettings(true);
    try {
      const path = await exportSettingsAsJson(getSettingsExportPayload());
      if (path) {
        addNotification("Settings exported", "success");
      }
    } catch (err) {
      console.error("Export settings failed:", err);
      addNotification("Export failed: " + err.message, "error");
    } finally {
      setIsExportingSettings(false);
    }
  };

  const handleImportSettings = async () => {
    const { addNotification } = useUIStore.getState();

    setIsImportingSettings(true);
    try {
      const imported = await importSettingsFromJson();
      if (!imported) return;

      importSettingsPayload(imported);
      addNotification("Settings imported successfully", "success");
    } catch (err) {
      console.error("Import settings failed:", err);
      addNotification("Import failed: " + err.message, "error");
    } finally {
      setIsImportingSettings(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13.5px] text-text-primary">
          Save or load theme, editor preferences, and key bindings as a JSON file.
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
          Useful for sharing settings between workspaces or machines.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <BusyButton
          onClick={handleImportSettings}
          busy={isImportingSettings}
          disabled={isExportingSettings}
          className="btn"
        >
          Import settings
        </BusyButton>
        <BusyButton
          onClick={handleExportSettings}
          busy={isExportingSettings}
          disabled={isImportingSettings}
          className="btn btn-primary"
        >
          Export settings
        </BusyButton>
      </div>
    </div>
  );
}

const fuse = new Fuse(
  SECTIONS.map(({ id, label, keywords }) => ({ id, label, keywords })),
  {
    keys: ["label", "keywords"],
    threshold: 0.35,
    ignoreLocation: true,
  }
);

const SettingsPage = ({ onOpenKeymapsModal, initialSection }) => {
  const [activeSection, setActiveSection] = useState(initialSection || "appearance");
  const [query, setQuery] = useState("");

  // A deep link (e.g. the sidebar's "Scheduled" row) names a section.
  useEffect(() => {
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection]);

  const visibleSections = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    return fuse
      .search(query)
      .map((result) => SECTIONS.find((section) => section.id === result.item.id));
  }, [query]);

  const active = SECTIONS.find((section) => section.id === activeSection) || SECTIONS[0];
  const ActiveContent = active.Content;
  // Sections whose body needs the keymaps-modal callback are functions taking
  // props; the rest are components rendered bare.
  const isPropsAwareContent = active.id === "shortcuts";

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-bg-editor">
      <nav className="md:w-60 shrink-0 md:border-e border-b md:border-b-0 border-border px-3 py-3 md:py-8 flex flex-col">
        <h1 className="hidden px-2.5 pb-3 text-[15px] font-semibold text-text-primary md:block">
          Settings
        </h1>
        <div className="px-1 pb-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="field h-9"
          />
        </div>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto">
          {visibleSections.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              aria-current={activeSection === item.id ? "page" : undefined}
              // On the sheet the sidebar's white pill has nothing to stand out
              // from, so the selected section takes the hover tint instead.
              className={`side-row w-auto shrink-0 whitespace-nowrap md:w-full ${
                activeSection === item.id ? "is-active bg-item-hover!" : ""
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          {visibleSections.length === 0 && (
            <p className="px-2.5 py-2 text-[12.5px] text-text-muted">No settings match.</p>
          )}
        </div>
      </nav>

      <div
        key={active.id}
        className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-8 md:px-12 py-6 md:py-12"
      >
        <div className="mx-auto max-w-[760px] space-y-6">
          <SectionHeader title={active.label} description={active.description} />
          <div className="rounded-card bg-item-active p-6 shadow-[0_0_0_1px_var(--color-border)]">
            {isPropsAwareContent ? (
              <ActiveContent onOpenKeymapsModal={onOpenKeymapsModal} />
            ) : (
              <ActiveContent />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
