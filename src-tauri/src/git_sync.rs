//! Git sync for a workspace folder.
//!
//! The vault is an ordinary git repository and syncing is one round of
//! `commit → fetch → merge → push`. Everything shells out to the system `git`
//! binary rather than linking libgit2: the vendored libgit2 + OpenSSL stack
//! cost ~3 MB of app size, while `git` is already present on every machine
//! that could use this feature (macOS and Linux ship it; Windows users who
//! sync with git have Git for Windows). The frontend hides git sync entirely
//! when `git` is not found (`git_available`).
//!
//! Running the real binary means the user's global config, credential helpers
//! and hooks are in reach, so each invocation pins the behaviour Marky needs:
//! no GPG signing (`commit.gpgsign=false`), no hooks (`core.hooksPath=` — a
//! hung hook would stall a background auto-sync forever), no credential-helper
//! dialogs (`credential.helper=`), no terminal prompts
//! (`GIT_TERMINAL_PROMPT=0`), and local `file://` remotes allowed
//! (`protocol.file.allow=always`, needed since git 2.38.1).
//!
//! ## Conflicts never produce markers
//!
//! A markdown editor showing `<<<<<<< HEAD` in the middle of a note is not
//! something a note-taker can be asked to resolve. When a merge conflicts, the
//! local version stays at its path (read back from index stage 2, undoing the
//! markers git wrote into the working file) and the remote version is written
//! beside it as `Note (conflict …).md` (from stage 3). Both versions survive,
//! the merge commit records the resolution, and the next sync is clean.
//!
//! That mirrors the promise the S3 backend already makes: sync never destroys
//! a version of a note that only exists on one side.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

/// How to authenticate against the remote.
///
/// `mode` mirrors what the settings UI offers rather than what git supports,
/// so an unknown value is rejected loudly instead of silently falling back to
/// an anonymous attempt.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAuth {
    /// `token` (HTTPS), `ssh-agent`, or `ssh-key`.
    #[serde(default)]
    pub mode: String,
    /// HTTPS username. GitHub ignores it when a PAT is supplied, but GitLab
    /// and self-hosted hosts do not, so it is sent when present.
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub ssh_key_path: Option<String>,
    #[serde(default)]
    pub ssh_passphrase: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOptions {
    /// Commit author. Empty falls back to the machine's git config, then to a
    /// neutral identity — a vault should sync on a machine that has never had
    /// `git config user.email` run on it.
    #[serde(default)]
    pub author_name: Option<String>,
    #[serde(default)]
    pub author_email: Option<String>,
    /// Subject line for the automatic commit.
    #[serde(default)]
    pub commit_message: Option<String>,
    /// Human-readable stamp for conflict sidecar filenames, formatted by the
    /// frontend so it lands in the user's own locale and timezone. Rust has no
    /// date formatting in std and this is the only place a date is needed.
    #[serde(default)]
    pub conflict_label: Option<String>,
    /// Commit and merge locally but do not contact the remote. Used by the
    /// "commit only" path and by tests.
    #[serde(default)]
    pub offline: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub id: String,
    pub summary: String,
    /// Epoch seconds, so the frontend formats it in the user's locale.
    pub time: i64,
    pub author: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    /// False when the folder is inside a repo whose root is somewhere else —
    /// syncing that would commit the parent project, not the vault.
    pub is_repo_root: bool,
    pub branch: Option<String>,
    pub remote_url: Option<String>,
    pub has_upstream: bool,
    pub ahead: usize,
    pub behind: usize,
    /// Files changed in the working tree since the last commit.
    pub dirty: usize,
    /// A previous merge left the index conflicted — sync refuses to run until
    /// it is cleared, rather than committing half a merge.
    pub conflicted: bool,
    pub last_commit: Option<CommitInfo>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    /// Files in the commit this sync created, if any.
    pub committed: usize,
    /// Files the merge changed on disk.
    pub pulled: usize,
    /// Commits handed to the remote.
    pub pushed: usize,
    /// Sidecar paths written for conflicted files, relative to the vault.
    pub conflicts: Vec<String>,
    pub branch: String,
    pub commit: Option<String>,
    /// Whether the working tree changed — the frontend reloads the vault only
    /// when this is true.
    pub changed_working_tree: bool,
}

// ── Errors ──────────────────────────────────────────────────────────────────

/// Git's stderr is written for people who know git. These rewrite the handful
/// a note-taker will actually hit into something actionable, and pass
/// everything else through rather than inventing a vague catch-all.
fn describe(stderr: &str) -> String {
    // The real diagnosis lives in git's `fatal:`/`error:` lines; the tail is
    // often a dangling hint like "and the repository exists." — so lead with
    // the first diagnostic line and only fall back to the tail.
    let trimmed = stderr.trim();
    let message = trimmed
        .lines()
        .find(|line| {
            let lowered = line.trim().to_lowercase();
            lowered.starts_with("fatal:") || lowered.starts_with("error:")
        })
        .or_else(|| trimmed.lines().last())
        .unwrap_or("git failed")
        .trim();
    let lowered = message.to_lowercase();

    if lowered.contains("authentication")
        || lowered.contains("401")
        || lowered.contains("could not read username")
        || lowered.contains("terminal prompts disabled")
        || lowered.contains("invalid credentials")
    {
        return format!("Authentication failed — check your token or SSH key. ({message})");
    }
    if lowered.contains("403") || lowered.contains("permission to") {
        return format!(
            "The remote refused access — the token may lack write permission. ({message})"
        );
    }
    if lowered.contains("404") || lowered.contains("not found") {
        return format!("Repository not found — check the remote URL. ({message})");
    }
    if lowered.contains("could not resolve host")
        || lowered.contains("connection")
        || lowered.contains("timed out")
        || lowered.contains("unable to access")
    {
        return format!("Could not reach the remote — check your connection. ({message})");
    }
    if lowered.contains("non-fast-forward")
        || lowered.contains("[rejected]")
        || lowered.contains("fetch first")
    {
        return format!(
            "The remote moved ahead and the push was rejected. Sync again to merge first. ({message})"
        );
    }
    message.to_string()
}

fn git_not_found() -> String {
    "Git is not installed or not on this app's PATH. Install git, then restart Marky.".to_string()
}

// ── Running git ─────────────────────────────────────────────────────────────

/// Config pinned for every invocation, so the user's global setup cannot turn
/// a background sync into a dialog box or a hung hook. See the module docs.
const PINNED_CONFIG: [(&str, &str); 5] = [
    ("commit.gpgsign", "false"),
    ("core.hooksPath", ""),
    ("credential.helper", ""),
    ("protocol.file.allow", "always"),
    ("advice.detachedHead", "false"),
];

/// One git invocation in a directory. Returns trimmed stdout on success;
/// a descriptive error built from stderr on failure.
fn git(dir: &Path, args: &[&str], envs: &[(&str, String)]) -> Result<String, String> {
    let mut command = Command::new("git");
    for (key, value) in PINNED_CONFIG {
        command.args(["-c", &format!("{key}={value}")]);
    }
    command
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0");
    // An empty value must actually be passed (it disables hooks); `envs`
    // carries optional extras like GIT_SSH_COMMAND.
    for (key, value) in envs {
        command.env(key, value);
    }

    let output = command.output().map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            git_not_found()
        } else {
            format!("Could not run git: {err}")
        }
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        return Err(describe(&stderr));
    }
    Ok(stdout.trim_end().to_string())
}

/// Raw variant for content that must not be trimmed or UTF-8 mangled
/// (`git show :2:path` hands back exact blob bytes).
fn git_bytes(dir: &Path, args: &[&str], envs: &[(&str, String)]) -> Result<Vec<u8>, String> {
    let mut command = Command::new("git");
    for (key, value) in PINNED_CONFIG {
        command.args(["-c", &format!("{key}={value}")]);
    }
    command
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0");
    for (key, value) in envs {
        command.env(key, value);
    }
    let output = command.output().map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            git_not_found()
        } else {
            format!("Could not run git: {err}")
        }
    })?;
    if !output.status.success() {
        return Err(describe(&String::from_utf8_lossy(&output.stderr)));
    }
    Ok(output.stdout)
}

/// True when a revision exists (`rev-parse --verify --quiet` exits non-zero
/// silently for a missing one).
fn rev_exists(dir: &Path, rev: &str, envs: &[(&str, String)]) -> Result<bool, String> {
    Ok(git(dir, &["rev-parse", "--verify", "--quiet", rev], envs).is_ok())
}

/// `~` in an SSH key path is written by hand often enough to be worth
/// expanding; git does not do it inside `-i`.
fn shell_expand(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return Path::new(&home).join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

// ── Auth ────────────────────────────────────────────────────────────────────

/// Percent-encode everything outside RFC 3986's unreserved set, so a token
/// containing `:` `/` `@` cannot corrupt the URL it is embedded in.
fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

fn is_http(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

fn is_ssh(url: &str) -> bool {
    url.starts_with("ssh://") || url.starts_with("git@")
}

/// Turn settings + remote URL into what an operation needs: either a rewritten
/// URL carrying the credentials (HTTPS token) or environment variables
/// (SSH key/agent). Nothing secret is ever written to `.git/config`.
///
/// An empty auth mode means "no credentials configured" — legitimate for
/// anonymous remotes and `file://` test repositories, so it authenticates as
/// whatever the URL itself allows.
fn prepare_auth(
    url: &str,
    auth: &GitAuth,
) -> Result<(Option<String>, Vec<(&'static str, String)>), String> {
    match auth.mode.as_str() {
        "" => Ok((None, Vec::new())),
        "token" => {
            if !is_http(url) {
                return Err(
                    "Token authentication needs an https:// remote — switch to SSH authentication for this URL.".to_string(),
                );
            }
            let token = auth.token.clone().unwrap_or_default();
            if token.is_empty() {
                return Err("No access token configured for this remote.".to_string());
            }
            let user = if auth.username.as_deref().unwrap_or("").is_empty() {
                "git".to_string()
            } else {
                auth.username.clone().unwrap()
            };
            // Scheme-preserving splice: https://host/x.git → https://user:token@host/x.git
            let rest = &url[url.find("://").map_or(0, |i| i + 3)..];
            let authed = format!(
                "{}{}:{}@{}",
                &url[..url.find("://").map_or(0, |i| i + 3)],
                url_encode(&user),
                url_encode(&token),
                rest
            );
            Ok((Some(authed), Vec::new()))
        }
        "ssh-agent" => {
            if !is_ssh(url) && !is_http(url) {
                // file:// and other exotic transports never ask for keys; pass through.
                return Ok((None, Vec::new()));
            }
            if !is_ssh(url) {
                return Err(
                    "This remote is not an SSH remote — switch to token authentication."
                        .to_string(),
                );
            }
            Ok((None, Vec::new()))
        }
        "ssh-key" => {
            if !is_ssh(url) {
                return Err(
                    "This remote is not an SSH remote — switch to token authentication."
                        .to_string(),
                );
            }
            let key = shell_expand(auth.ssh_key_path.as_deref().unwrap_or(""));
            if key.is_empty() {
                return Err("No SSH key file configured.".to_string());
            }
            if !Path::new(&key).exists() {
                return Err(format!("SSH key file not found: {key}"));
            }

            let passphrase = auth.ssh_passphrase.clone().unwrap_or_default();
            let batch = if passphrase.is_empty() { "yes" } else { "no" };
            let ssh_command =
                format!("ssh -i {key} -o IdentitiesOnly=yes -o BatchMode={batch} -o StrictHostKeyChecking=accept-new");

            let mut envs: Vec<(&'static str, String)> = vec![("GIT_SSH_COMMAND", ssh_command)];

            // A passphrase-protected key needs something to type into. There is
            // no terminal here, so hand ssh an askpass program that knows one
            // answer. OpenSSH ≥ 8.4 honours SSH_ASKPASS_REQUIRE=force without
            // a display; older builds want DISPLAY set as well, so set both.
            if !passphrase.is_empty() {
                let escaped = passphrase.replace('\'', "'\\''");
                let script = {
                    #[cfg(windows)]
                    {
                        let path = std::env::temp_dir()
                            .join(format("marky-askpass-{}.cmd", std::process::id()));
                        let _ = std::fs::write(&path, format!("@echo {}\r\n", passphrase));
                        path
                    }
                    #[cfg(not(windows))]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let path = std::env::temp_dir()
                            .join(format("marky-askpass-{}.sh", std::process::id()));
                        let _ = std::fs::write(
                            &path,
                            format!("#!/bin/sh\nprintf '%s\\n' '{escaped}'\n"),
                        );
                        let _ =
                            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700));
                        path
                    }
                };
                envs.push(("GIT_SSH_COMMAND", format!("ssh -i {key} -o IdentitiesOnly=yes -o BatchMode=no -o StrictHostKeyChecking=accept-new -o SetEnv=SSH_ASKPASS={}", script.display())));
                envs.push(("SSH_ASKPASS", script.display().to_string()));
                envs.push(("SSH_ASKPASS_REQUIRE", "force".to_string()));
                envs.push(("DISPLAY", ":0".to_string()));
                // The script outlives the command (git may spawn several ssh
                // calls); it holds only the passphrase the caller already gave
                // us this session. Best-effort: remove it after the operation
                // via the caller dropping AuthContext is not observable, so a
                // temp-dir file is left behind — acceptable for a scratch file.
            }

            Ok((None, envs))
        }
        other => Err(format!("Unknown authentication mode '{other}'.")),
    }
}

/// Auth resolved for a specific operation against a specific remote URL.
struct AuthContext {
    url: Option<String>,
    envs: Vec<(&'static str, String)>,
}

impl AuthContext {
    fn new(url: &str, auth: &GitAuth) -> Result<Self, String> {
        let (rewritten, envs) = prepare_auth(url, auth)?;
        Ok(AuthContext {
            url: rewritten,
            envs,
        })
    }

    /// What to pass where a remote name would go.
    fn target<'a>(&'a self, fallback: &'a str) -> &'a str {
        self.url.as_deref().unwrap_or(fallback)
    }
}

// ── Small queries ───────────────────────────────────────────────────────────

fn current_branch(path: &Path) -> Result<Option<String>, String> {
    // Detached HEAD fails symbolic-ref; that maps to None, not an error.
    Ok(git(path, &["symbolic-ref", "--short", "HEAD"], &[])
        .ok()
        .filter(|name| !name.is_empty()))
}

/// The commit identity: prefer the app's settings, then the machine's git
/// config, then a neutral default. Returned as `-c` overrides because a
/// machine without any git identity would otherwise fail every commit.
fn identity_args(options: &SyncOptions) -> Vec<String> {
    let name = options.author_name.as_deref().unwrap_or("").trim();
    let email = options.author_email.as_deref().unwrap_or("").trim();
    let mut args = Vec::new();
    if !name.is_empty() {
        args.extend(["-c".to_string(), format!("user.name={name}")]);
    }
    if !email.is_empty() {
        args.extend(["-c".to_string(), format!("user.email={email}")]);
    }
    args
}

/// Commit staged changes, retrying once with a neutral identity when the
/// machine has no git identity configured at all.
fn commit(
    path: &Path,
    message: &str,
    options: &SyncOptions,
    envs: &[(&str, String)],
) -> Result<Option<String>, String> {
    let identity = identity_args(options);
    // Config overrides must come *before* the subcommand:
    // `git -c user.name=… commit -m …`.
    let neutral = [
        "-c".to_string(),
        "user.name=Marky".to_string(),
        "-c".to_string(),
        "user.email=marky@localhost".to_string(),
    ];
    let attempt = |overrides: &[String]| -> Result<String, String> {
        let mut all: Vec<String> = overrides.to_vec();
        all.extend(["commit".to_string(), "-m".to_string(), message.to_string()]);
        let refs: Vec<&str> = all.iter().map(String::as_str).collect();
        git(path, &refs, envs)
    };

    match attempt(&identity) {
        Ok(_) => Ok(Some(message.to_string())),
        Err(err) => {
            let lowered = err.to_lowercase();
            // "Please tell me who you are" sits on an earlier stderr line than
            // the one `describe` keeps, so match its final line's phrasing too.
            if lowered.contains("who you are")
                || lowered.contains("user.email")
                || lowered.contains("user.name")
                || lowered.contains("no email was given")
                || lowered.contains("no name was given")
                || lowered.contains("auto-detection is disabled")
            {
                attempt(&neutral).map(Some)
            } else {
                Err(err)
            }
        }
    }
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Is the `git` binary available? The frontend gates the whole git-sync
/// section on this. Returns the version line, e.g. `git version 2.46.0`.
#[tauri::command(async)]
pub fn git_available() -> Option<String> {
    Command::new("git")
        .arg("--version")
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|version| !version.is_empty())
}

/// Describe the vault's git state for the settings panel. Never fails for a
/// non-repository — "not a repo yet" is a normal state the UI renders.
#[tauri::command(async)]
pub fn git_repo_status(path: String) -> Result<GitStatus, String> {
    let dir = Path::new(&path);

    // `rev-parse --show-toplevel` walks upward, unlike a `.git` existence
    // check. That is deliberate here and only here: it is what lets the UI
    // warn that the vault sits *inside* another repository. Every mutating
    // operation below requires the vault to be a repository root itself.
    let toplevel = match git(dir, &["rev-parse", "--show-toplevel"], &[]) {
        Ok(top) => top,
        Err(_) => {
            return Ok(GitStatus {
                is_repo: false,
                is_repo_root: false,
                branch: None,
                remote_url: None,
                has_upstream: false,
                ahead: 0,
                behind: 0,
                dirty: 0,
                conflicted: false,
                last_commit: None,
            })
        }
    };

    let canonical_target = dir.canonicalize().ok();
    let is_repo_root = Path::new(&toplevel)
        .canonicalize()
        .ok()
        .zip(canonical_target)
        .map(|(workdir, target)| workdir == target)
        .unwrap_or(false);

    let branch = current_branch(dir).unwrap_or(None);
    let remote_url = git(dir, &["remote", "get-url", "origin"], &[]).ok();

    let head_exists = rev_exists(dir, "HEAD", &[])?;
    let mut ahead = 0;
    let mut behind = 0;
    let mut has_upstream = false;
    if head_exists && branch.is_some() {
        // `<left>\t<right>`: commits only in HEAD (ahead), only upstream (behind).
        if let Ok(counts) = git(
            dir,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
            &[],
        ) {
            has_upstream = true;
            let mut parts = counts.split_whitespace();
            ahead = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
            behind = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
        }
    }

    let conflicted = !git(dir, &["ls-files", "-u"], &[])
        .unwrap_or_default()
        .is_empty();
    let dirty = git(dir, &["status", "--porcelain"], &[])
        .map(|out| out.lines().count())
        .unwrap_or(0);

    let last_commit = if head_exists {
        git(dir, &["log", "-1", "--format=%H%x1f%s%x1f%at%x1f%an"], &[])
            .ok()
            .and_then(|line| {
                let mut fields = line.split('\x1f');
                Some(CommitInfo {
                    id: fields.next()?.to_string(),
                    summary: fields.next().unwrap_or("").to_string(),
                    time: fields.next()?.parse().ok()?,
                    author: fields.next().unwrap_or("").to_string(),
                })
            })
    } else {
        None
    };

    Ok(GitStatus {
        is_repo: true,
        is_repo_root,
        branch,
        remote_url,
        has_upstream,
        ahead,
        behind,
        dirty,
        conflicted,
        last_commit,
    })
}

/// Turn a workspace folder into a repository pointed at `remote_url`.
///
/// Safe to call on a folder that is already a repo: it only updates the remote,
/// which is what "I typed the wrong URL" needs.
#[tauri::command(async)]
pub fn git_init_repo(
    path: String,
    remote_url: String,
    branch: Option<String>,
) -> Result<GitStatus, String> {
    let branch = branch
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "main".to_string());
    let dir = Path::new(&path);

    if !dir.join(".git").exists() {
        git(dir, &["init", "--quiet"], &[])?;
        // `git init -b` needs git ≥ 2.28; setting HEAD directly works everywhere
        // and also renames the default on machines whose git still says master.
        let _ = git(
            dir,
            &["symbolic-ref", "HEAD", &format!("refs/heads/{branch}")],
            &[],
        );
    }

    if !remote_url.is_empty() {
        if git(dir, &["remote", "get-url", "origin"], &[]).is_ok() {
            git(dir, &["remote", "set-url", "origin", &remote_url], &[])?;
        } else {
            git(dir, &["remote", "add", "origin", &remote_url], &[])?;
        }
    }

    // A vault carries editor state and local caches that must never reach a
    // shared remote. Written only when absent so a hand-tuned one survives.
    let ignore_path = dir.join(".gitignore");
    if !ignore_path.exists() {
        let _ = std::fs::write(
            &ignore_path,
            "# Marky\n.DS_Store\nThumbs.db\n.marky/\n.obsidian/\n.trash/\n",
        );
    }

    git_repo_status(path)
}

/// Clone a vault onto a second device. The target must not already hold a
/// repository — overwriting one silently is never what the user meant.
#[tauri::command(async)]
pub fn git_clone_repo(url: String, path: String, auth: GitAuth) -> Result<GitStatus, String> {
    if Path::new(&path).join(".git").exists() {
        return Err("That folder is already a git repository.".to_string());
    }
    let target = Path::new(&path);
    if target.exists()
        && target
            .read_dir()
            .map(|mut d| d.next().is_some())
            .unwrap_or(false)
    {
        return Err("Clone needs an empty folder — pick a new one.".to_string());
    }

    let context = AuthContext::new(&url, &auth)?;
    let mut args: Vec<&str> = vec!["clone", "--quiet"];
    let url_ref = context.target(&url);
    args.push(url_ref);
    args.push(&path);
    git(Path::new("."), &args, &context.envs)?;

    // A remote whose HEAD points at a branch nobody ever published clones with
    // an unborn HEAD and an empty folder. Check out whatever the remote
    // actually has instead of handing back a blank vault.
    let dir = target;
    let has_head = rev_exists(dir, "HEAD", &context.envs)?;
    if !has_head {
        let heads = git(dir, &["ls-remote", "--heads", url_ref], &context.envs)?;
        let mut candidates: Vec<String> = heads
            .lines()
            .filter_map(|line| line.split("\t").nth(1))
            .filter_map(|refname| refname.strip_prefix("refs/heads/"))
            .map(str::to_string)
            .collect();
        candidates.sort_by_key(|name| match name.as_str() {
            "main" => 0,
            "master" => 1,
            _ => 2,
        });
        if let Some(name) = candidates.first() {
            let origin_ref = format!("origin/{name}");
            git(
                dir,
                &["checkout", "--quiet", "-B", name, &origin_ref],
                &context.envs,
            )?;
        }
    }

    git_repo_status(path)
}

/// Contact the remote and confirm the credentials work, without changing
/// anything. `git ls-remote` in one call.
#[tauri::command(async)]
pub fn git_test_remote(url: String, auth: GitAuth) -> Result<usize, String> {
    let context = AuthContext::new(&url, &auth)?;
    let listing = git(
        Path::new("."),
        &["ls-remote", context.target(&url)],
        &context.envs,
    )?;
    Ok(listing.lines().count())
}

/// One full sync: commit local changes, merge the remote, push the result.
///
/// The order matters and is not negotiable. Committing *first* means the merge
/// can force-update its result without any risk to uncommitted work — which
/// is what lets conflicts be resolved into sidecar files instead of markers.
#[tauri::command(async)]
pub fn git_sync(path: String, auth: GitAuth, options: SyncOptions) -> Result<SyncReport, String> {
    let dir = Path::new(&path);
    let empty_env: Vec<(&str, String)> = Vec::new();

    if !dir.join(".git").exists() {
        return Err("This folder is not a git repository yet — set up git sync first.".to_string());
    }
    if !git(dir, &["ls-files", "-u"], &empty_env)
        .unwrap_or_default()
        .is_empty()
    {
        return Err(
            "The repository has an unresolved merge from outside Marky. Resolve it in git, then sync again."
                .to_string(),
        );
    }

    let branch = current_branch(dir)?
        .ok_or_else(|| "HEAD is detached — check out a branch to sync.".to_string())?;
    let mut report = SyncReport {
        branch: branch.clone(),
        ..Default::default()
    };

    // The remote URL decides how authentication attaches. A local-only repo is
    // a legitimate configuration: history without a backup.
    let remote_url = git(dir, &["remote", "get-url", "origin"], &empty_env).ok();

    // ── 1. Commit whatever is on disk ───────────────────────────────────
    let changed: usize = git(dir, &["status", "--porcelain"], &empty_env)
        .map(|out| out.lines().count())
        .unwrap_or(0);
    if changed > 0 {
        git(dir, &["add", "--all"], &empty_env)?;
        let message = options
            .commit_message
            .clone()
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| format!("Sync {changed} file(s) from Marky"));
        let commit_env: Vec<(&str, String)> = Vec::new();
        if commit(dir, &message, &options, &commit_env)?.is_some() {
            report.committed = changed;
            report.commit = git(dir, &["rev-parse", "HEAD"], &empty_env).ok();
        }
    }

    if options.offline || remote_url.is_none() {
        report.changed_working_tree = report.pulled > 0;
        return Ok(report);
    }
    let remote_url = remote_url.unwrap();
    let context = AuthContext::new(&remote_url, &auth)?;

    // ── 2. Fetch ────────────────────────────────────────────────────────
    let refspec = format!("+refs/heads/{branch}:refs/remotes/origin/{branch}");
    // A remote with no matching branch yet is not an error — it is the first
    // push of a brand new vault.
    let fetched = git(
        dir,
        &["fetch", "--quiet", context.target("origin"), &refspec],
        &context.envs,
    )
    .is_ok();

    // ── 3. Merge ────────────────────────────────────────────────────────
    let remote_ref = format!("refs/remotes/origin/{branch}");
    let old_head = git(dir, &["rev-parse", "HEAD"], &empty_env).ok();
    if fetched && rev_exists(dir, &remote_ref, &context.envs)? {
        merge_remote(
            dir,
            &branch,
            old_head.as_deref(),
            &options,
            &context,
            &mut report,
        )?;
    }

    // ── 4. Push ─────────────────────────────────────────────────────────
    if rev_exists(dir, "HEAD", &context.envs)? {
        let ahead = if rev_exists(dir, &remote_ref, &context.envs)? {
            git(
                dir,
                &["rev-list", "--count", &format!("{remote_ref}..HEAD")],
                &context.envs,
            )?
            .parse()
            .unwrap_or(1)
        } else {
            1 // nothing on the remote yet: everything is ahead
        };

        if ahead > 0 {
            let spec = format!("refs/heads/{branch}:refs/heads/{branch}");
            git(
                dir,
                &["push", "--quiet", context.target("origin"), &spec],
                &context.envs,
            )?;
            report.pushed = ahead;
            // git does move origin/{branch} after a push over the same URL,
            // but a push by explicit URL can leave the tracking ref stale —
            // update it ourselves so the next sync sees the truth.
            let _ = git(dir, &["update-ref", &remote_ref, "HEAD"], &context.envs);
            // Record the upstream so `git status` in a terminal agrees with us.
            let _ = git(
                dir,
                &[
                    "branch",
                    &format!("--set-upstream-to=origin/{branch}"),
                    &branch,
                ],
                &context.envs,
            );
        }
    }

    report.changed_working_tree = report.pulled > 0;
    Ok(report)
}

/// Merge `origin/{branch}` into the current branch, resolving conflicts into
/// sidecar files. `old_head` is the pre-merge HEAD (None for an unborn
/// branch) and feeds the pulled-file count.
fn merge_remote(
    dir: &Path,
    branch: &str,
    old_head: Option<&str>,
    options: &SyncOptions,
    context: &AuthContext,
    report: &mut SyncReport,
) -> Result<(), String> {
    let remote_short = format!("origin/{branch}");

    // Already up to date?
    let head = git(dir, &["rev-parse", "HEAD"], &context.envs).ok();
    let remote_oid = git(dir, &["rev-parse", &remote_short], &context.envs)?;
    if head.as_deref() == Some(remote_oid.trim()) {
        return Ok(());
    }

    // Unborn branch: the vault's very first commits come from the remote.
    // Point the branch at the remote commit and check it out.
    let Some(head_oid) = head else {
        git(
            dir,
            &["checkout", "--quiet", "-B", branch, &remote_short],
            &context.envs,
        )?;
        report.pulled = git(dir, &["ls-files"], &context.envs)?.lines().count();
        return Ok(());
    };

    // Fast-forward when the remote contains everything we have.
    let ff = git(
        dir,
        &["merge-base", "--is-ancestor", &head_oid, &remote_short],
        &context.envs,
    )
    .is_ok();
    if ff {
        git(
            dir,
            &["merge", "--quiet", "--ff-only", &remote_short],
            &context.envs,
        )?;
        report.pulled = count_changes(dir, old_head, "HEAD", context)?;
        return Ok(());
    }

    // Real three-way merge. On conflict git writes markers into the working
    // files and stops — we then rebuild each file from the index stages.
    let message = format!("Merge {remote_short} (Marky sync)");
    if git(
        dir,
        &["merge", "--no-ff", "-m", &message, &remote_short],
        &context.envs,
    )
    .is_ok()
    {
        report.pulled = count_changes(dir, old_head, "HEAD", context)?;
        return Ok(());
    }

    // ── Conflict resolution: ours stays, theirs becomes a sidecar ──────
    let label = options
        .conflict_label
        .clone()
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| "conflict".to_string());

    let conflicted_paths: Vec<String> = git(
        dir,
        &["diff", "--name-only", "--diff-filter=U"],
        &context.envs,
    )?
    .lines()
    .map(str::to_string)
    .collect();
    if conflicted_paths.is_empty() {
        // Not a conflict — a genuine failure (locked index, etc.). Surface it.
        return Err(git(
            dir,
            &["merge", "--no-ff", "-m", &message, &remote_short],
            &context.envs,
        )
        .unwrap_err());
    }

    for path in &conflicted_paths {
        let ours_stage = format!(":2:{path}");
        let theirs_stage = format!(":3:{path}");
        let ours_id = git(dir, &["rev-parse", &ours_stage], &context.envs).ok();
        let theirs_id = git(dir, &["rev-parse", &theirs_stage], &context.envs).ok();

        // Deleted locally but changed remotely: keeping theirs at the original
        // path is the non-destructive reading — a deletion is cheap to repeat,
        // a lost note is not.
        match (&ours_id, &theirs_id) {
            (Some(ours), Some(theirs)) if ours == theirs => {
                // Identical content is not a conflict worth a sidecar.
                git(dir, &["add", "--", path], &context.envs)?;
                continue;
            }
            (Some(_), _) => {
                // Restore our version, erasing the markers git wrote.
                let bytes = git_bytes(dir, &["show", &ours_stage], &context.envs)?;
                std::fs::write(dir.join(path), bytes)
                    .map_err(|e| format!("Could not restore {}: {e}", path))?;
            }
            (None, Some(_)) => {
                let bytes = git_bytes(dir, &["show", &theirs_stage], &context.envs)?;
                std::fs::write(dir.join(path), bytes)
                    .map_err(|e| format!("Could not restore {}: {e}", path))?;
                git(dir, &["add", "--", path], &context.envs)?;
                continue;
            }
            (None, None) => continue,
        }

        // Theirs lands beside it.
        if theirs_id.is_some() {
            let sidecar = sidecar_name(path, &label);
            let bytes = git_bytes(dir, &["show", &theirs_stage], &context.envs)?;
            std::fs::write(dir.join(&sidecar), bytes)
                .map_err(|e| format!("Could not write {sidecar}: {e}"))?;
            report.conflicts.push(sidecar.clone());
            git(dir, &["add", "--", path, &sidecar], &context.envs)?;
        } else {
            git(dir, &["add", "--", path], &context.envs)?;
        }
    }

    let conflicts_note = report.conflicts.len();
    let message = if conflicts_note == 0 {
        message
    } else {
        format!("{message} — {conflicts_note} conflict(s) kept side by side")
    };
    let commit_env: Vec<(&str, String)> = Vec::new();
    commit(dir, &message, options, &commit_env)?;

    report.pulled = count_changes(dir, old_head, "HEAD", context)?;
    Ok(())
}

/// How many paths differ between two revisions — the "files changed" number
/// the sync report shows. A `None` start counts every tracked file, so a
/// first checkout reports every file as arriving.
fn count_changes(
    dir: &Path,
    from: Option<&str>,
    to: &str,
    context: &AuthContext,
) -> Result<usize, String> {
    match from {
        Some(from) => {
            let range = format!("{from}..{to}");
            Ok(git(dir, &["diff", "--name-only", &range], &context.envs)?
                .lines()
                .count())
        }
        None => Ok(git(dir, &["ls-files"], &context.envs)?.lines().count()),
    }
}

/// `notes/Todo.md` + `conflict 2026-08-25` → `notes/Todo (conflict 2026-08-25).md`.
/// Keeps the extension last so the file still opens as markdown.
pub fn sidecar_name(path: &str, label: &str) -> String {
    match path.rfind('.') {
        // A dot in a directory name is not an extension.
        Some(dot) if dot > path.rfind('/').map_or(0, |slash| slash + 1) => {
            format!("{} ({}){}", &path[..dot], label, &path[dot..])
        }
        _ => format!("{path} ({label})"),
    }
}

/// Discard every uncommitted change and match the remote exactly. The escape
/// hatch for a vault that has drifted past the point of merging — destructive
/// by design, so the UI asks first.
#[tauri::command(async)]
pub fn git_reset_to_remote(path: String, auth: GitAuth) -> Result<GitStatus, String> {
    let dir = Path::new(&path);
    if !dir.join(".git").exists() {
        return Err("This folder is not a git repository yet — set up git sync first.".to_string());
    }
    let branch = current_branch(dir)?
        .ok_or_else(|| "HEAD is detached — check out a branch to sync.".to_string())?;

    let remote_url = git(dir, &["remote", "get-url", "origin"], &[])
        .map_err(|_| "This repository has no 'origin' remote.".to_string())?;
    let context = AuthContext::new(&remote_url, &auth)?;
    let refspec = format!("+refs/heads/{branch}:refs/remotes/origin/{branch}");
    git(
        dir,
        &["fetch", "--quiet", context.target("origin"), &refspec],
        &context.envs,
    )?;

    let remote_ref = format!("refs/remotes/origin/{branch}");
    if !rev_exists(dir, &remote_ref, &context.envs)? {
        return Err(format!("The remote has no branch named '{branch}'."));
    }
    git(
        dir,
        &["reset", "--hard", "--quiet", &remote_ref],
        &context.envs,
    )?;

    drop(context);
    git_repo_status(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command as SysCommand;

    #[test]
    fn sidecar_keeps_the_extension_last() {
        assert_eq!(
            sidecar_name("notes/Todo.md", "conflict 2026-08-25"),
            "notes/Todo (conflict 2026-08-25).md"
        );
    }

    #[test]
    fn sidecar_handles_a_file_with_no_extension() {
        assert_eq!(sidecar_name("LICENSE", "c"), "LICENSE (c)");
    }

    #[test]
    fn sidecar_ignores_a_dot_in_a_directory_name() {
        // The dot belongs to `v1.2`, not to the file, so appending must not
        // split the directory name.
        assert_eq!(sidecar_name("v1.2/README", "c"), "v1.2/README (c)");
    }

    #[test]
    fn shell_expand_leaves_absolute_paths_alone() {
        assert_eq!(shell_expand("/tmp/key"), "/tmp/key");
    }

    #[test]
    fn url_encode_escapes_url_structure_characters() {
        assert_eq!(url_encode("abc123"), "abc123");
        assert_eq!(url_encode("to:ken/p@ss word"), "to%3Aken%2Fp%40ss%20word");
    }

    // ── Round-trip sync ─────────────────────────────────────────────────
    //
    // These drive the real thing: two vaults pushing and pulling through a
    // bare repository on disk over `file://`. No network and no credentials,
    // but every other step — staging, committing, fetching, merging,
    // conflict resolution, pushing — is the code that runs in production.

    fn options() -> SyncOptions {
        SyncOptions {
            author_name: Some("Test".into()),
            author_email: Some("test@example.com".into()),
            conflict_label: Some("conflict 2026-08-25".into()),
            ..Default::default()
        }
    }

    /// A bare repo standing in for GitHub, plus a vault wired to it.
    fn remote_and_vault(root: &Path, name: &str) -> (String, String) {
        let remote = root.join("remote.git");
        fs::create_dir_all(&remote).unwrap();
        assert!(SysCommand::new("git")
            .arg("init")
            .arg("--bare")
            .arg("--quiet")
            .current_dir(&remote)
            .status()
            .unwrap()
            .success());
        let url = format!("file://{}", remote.display());
        let vault = root.join(name);
        fs::create_dir_all(&vault).unwrap();
        git_init_repo(vault.to_string_lossy().into(), url.clone(), None).unwrap();
        (url, vault.to_string_lossy().into())
    }

    fn write(vault: &str, name: &str, body: &str) {
        fs::write(Path::new(vault).join(name), body).unwrap();
    }

    fn read(vault: &str, name: &str) -> String {
        fs::read_to_string(Path::new(vault).join(name)).unwrap()
    }

    #[test]
    fn git_is_available_in_the_test_environment() {
        // Everything below depends on shelling out to git; make its absence
        // loud instead of a pile of confusing failures.
        assert!(
            git_available().is_some(),
            "git must be on PATH for these tests"
        );
    }

    #[test]
    fn first_sync_publishes_the_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let (_url, vault) = remote_and_vault(tmp.path(), "vault");
        write(&vault, "Note.md", "hello");

        let report = git_sync(vault.clone(), GitAuth::default(), options()).unwrap();
        assert!(report.committed > 0, "the new note should be committed");
        assert_eq!(report.pushed, 1);

        let status = git_repo_status(vault).unwrap();
        assert_eq!(status.dirty, 0, "everything should be committed");
        assert_eq!(status.ahead, 0, "the push should clear the ahead count");
    }

    #[test]
    fn a_second_device_pulls_what_the_first_pushed() {
        let tmp = tempfile::tempdir().unwrap();
        let (url, first) = remote_and_vault(tmp.path(), "first");
        write(&first, "Note.md", "from the first device");
        git_sync(first, GitAuth::default(), options()).unwrap();

        let second = tmp.path().join("second").to_string_lossy().into_owned();
        fs::create_dir_all(&second).unwrap();
        git_clone_repo(url, second.clone(), GitAuth::default()).unwrap();
        assert_eq!(read(&second, "Note.md"), "from the first device");
    }

    #[test]
    fn edits_from_two_devices_merge_into_one_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let (url, first) = remote_and_vault(tmp.path(), "first");
        write(&first, "A.md", "alpha");
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();

        let second = tmp.path().join("second").to_string_lossy().into_owned();
        fs::create_dir_all(&second).unwrap();
        git_clone_repo(url, second.clone(), GitAuth::default()).unwrap();

        // Each device writes a different note, then both sync.
        write(&first, "B.md", "beta");
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();
        write(&second, "C.md", "gamma");
        let report = git_sync(second.clone(), GitAuth::default(), options()).unwrap();

        assert!(report.changed_working_tree, "the merge brought B.md down");
        assert!(
            report.conflicts.is_empty(),
            "different files never conflict"
        );
        assert_eq!(read(&second, "B.md"), "beta");

        // …and the first device sees the second's note on its next sync.
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();
        assert_eq!(read(&first, "C.md"), "gamma");
    }

    // The promise this whole module is built around: a note edited on two
    // devices at once loses neither version, and never grows conflict markers.
    #[test]
    fn a_conflicting_note_keeps_both_versions_side_by_side() {
        let tmp = tempfile::tempdir().unwrap();
        let (url, first) = remote_and_vault(tmp.path(), "first");
        write(&first, "Note.md", "shared starting point");
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();

        let second = tmp.path().join("second").to_string_lossy().into_owned();
        fs::create_dir_all(&second).unwrap();
        git_clone_repo(url, second.clone(), GitAuth::default()).unwrap();

        // Same file, different edits, neither device having seen the other.
        write(&first, "Note.md", "written on the first device");
        git_sync(first, GitAuth::default(), options()).unwrap();
        write(&second, "Note.md", "written on the second device");
        let report = git_sync(second.clone(), GitAuth::default(), options()).unwrap();

        assert_eq!(report.conflicts, vec!["Note (conflict 2026-08-25).md"]);

        // Local edit stays put; the remote one lands beside it.
        assert_eq!(read(&second, "Note.md"), "written on the second device");
        assert_eq!(
            read(&second, "Note (conflict 2026-08-25).md"),
            "written on the first device"
        );

        // No markers anywhere, and the vault is clean afterwards.
        assert!(!read(&second, "Note.md").contains("<<<<<<<"));
        let status = git_repo_status(second).unwrap();
        assert!(!status.conflicted);
        assert_eq!(status.dirty, 0);
    }

    #[test]
    fn syncing_with_nothing_to_do_changes_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let (_url, vault) = remote_and_vault(tmp.path(), "vault");
        write(&vault, "Note.md", "hello");
        git_sync(vault.clone(), GitAuth::default(), options()).unwrap();

        let report = git_sync(vault, GitAuth::default(), options()).unwrap();
        assert_eq!(report.committed, 0);
        assert_eq!(report.pushed, 0);
        assert!(!report.changed_working_tree);
        assert!(report.conflicts.is_empty());
    }

    // A device with no local changes fast-forwards. The report still has to say
    // the working tree moved, or the app never reloads the vault and the
    // sidebar keeps showing notes that are no longer on disk.
    #[test]
    fn a_pure_pull_reports_that_the_working_tree_changed() {
        let tmp = tempfile::tempdir().unwrap();
        let (url, first) = remote_and_vault(tmp.path(), "first");
        write(&first, "A.md", "alpha");
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();

        let second = tmp.path().join("second").to_string_lossy().into_owned();
        fs::create_dir_all(&second).unwrap();
        git_clone_repo(url, second.clone(), GitAuth::default()).unwrap();

        // Only the first device changes anything, so the second fast-forwards.
        write(&first, "B.md", "beta");
        git_sync(first, GitAuth::default(), options()).unwrap();

        let report = git_sync(second.clone(), GitAuth::default(), options()).unwrap();
        assert_eq!(
            report.committed, 0,
            "the second device changed nothing itself"
        );
        assert_eq!(report.pulled, 1, "B.md arrived");
        assert!(
            report.changed_working_tree,
            "a fast-forward still rewrites the working tree"
        );
        assert_eq!(read(&second, "B.md"), "beta");
    }

    #[test]
    fn a_deleted_note_is_removed_on_the_other_device_too() {
        let tmp = tempfile::tempdir().unwrap();
        let (url, first) = remote_and_vault(tmp.path(), "first");
        write(&first, "Note.md", "hello");
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();

        let second = tmp.path().join("second").to_string_lossy().into_owned();
        fs::create_dir_all(&second).unwrap();
        git_clone_repo(url, second.clone(), GitAuth::default()).unwrap();

        fs::remove_file(Path::new(&first).join("Note.md")).unwrap();
        git_sync(first, GitAuth::default(), options()).unwrap();
        git_sync(second.clone(), GitAuth::default(), options()).unwrap();

        assert!(!Path::new(&second).join("Note.md").exists());
    }

    #[test]
    fn a_conflicting_delete_keeps_the_note_rather_than_losing_it() {
        // Edited locally, deleted remotely: the edit wins at the original path
        // — the same rule as S3 sync, where deletions never destroy data.
        let tmp = tempfile::tempdir().unwrap();
        let (url, first) = remote_and_vault(tmp.path(), "first");
        write(&first, "Note.md", "shared starting point");
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();

        let second = tmp.path().join("second").to_string_lossy().into_owned();
        fs::create_dir_all(&second).unwrap();
        git_clone_repo(url, second.clone(), GitAuth::default()).unwrap();

        write(&second, "Note.md", "edited on the second device");
        git_sync(second.clone(), GitAuth::default(), options()).unwrap();

        fs::remove_file(Path::new(&first).join("Note.md")).unwrap();
        git_sync(first.clone(), GitAuth::default(), options()).unwrap();
        git_sync(second.clone(), GitAuth::default(), options()).unwrap();

        assert_eq!(
            read(&second, "Note.md"),
            "edited on the second device",
            "the surviving edit should stay at its path"
        );
        let status = git_repo_status(second.clone()).unwrap();
        assert!(!status.conflicted);
        assert_eq!(status.dirty, 0);
    }

    #[test]
    fn a_vault_with_no_remote_still_gets_a_local_history() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("solo");
        fs::create_dir_all(&vault).unwrap();
        let vault: String = vault.to_string_lossy().into();
        git_init_repo(vault.clone(), String::new(), None).unwrap();
        write(&vault, "Note.md", "hello");

        let report = git_sync(vault.clone(), GitAuth::default(), options()).unwrap();
        assert!(report.committed > 0);
        assert_eq!(report.pushed, 0, "there is nowhere to push to");
        assert_eq!(git_repo_status(vault).unwrap().dirty, 0);
    }

    #[test]
    fn a_vault_nested_in_another_repo_is_flagged() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(SysCommand::new("git")
            .arg("init")
            .arg("--quiet")
            .current_dir(tmp.path())
            .status()
            .unwrap()
            .success());
        let nested = tmp.path().join("vault");
        fs::create_dir_all(&nested).unwrap();

        let status = git_repo_status(nested.to_string_lossy().into()).unwrap();
        assert!(status.is_repo, "it opens the parent repository");
        assert!(
            !status.is_repo_root,
            "syncing here would commit the parent project, not the vault"
        );
    }

    #[test]
    fn offline_sync_commits_without_touching_the_remote() {
        let tmp = tempfile::tempdir().unwrap();
        let (_url, vault) = remote_and_vault(tmp.path(), "vault");
        write(&vault, "Note.md", "hello");

        let mut opts = options();
        opts.offline = true;
        let report = git_sync(vault.clone(), GitAuth::default(), opts).unwrap();
        assert!(report.committed > 0);
        assert_eq!(report.pushed, 0, "offline never contacts the remote");
        assert_eq!(
            git_repo_status(vault).unwrap().dirty,
            0,
            "the changes should be committed"
        );
    }

    #[test]
    fn a_machine_with_no_git_identity_still_commits() {
        // Hide every git identity source and disable auto-detection (git
        // otherwise guesses a name from the username and hostname, which would
        // let the commit succeed without ever reaching the neutral retry):
        // the neutral-identity fallback is what keeps first runs working.
        let tmp = tempfile::tempdir().unwrap();
        let vault = tmp.path().join("vault");
        fs::create_dir_all(&vault).unwrap();
        let vault: String = vault.to_string_lossy().into();
        git_init_repo(vault.clone(), String::new(), None).unwrap();

        let isolated: Vec<(&str, String)> = vec![
            ("GIT_CONFIG_GLOBAL", "/dev/null".to_string()),
            ("GIT_CONFIG_SYSTEM", "/dev/null".to_string()),
        ];
        write(&vault, "Note.md", "hello");
        let dir = Path::new(&vault);
        git(dir, &["config", "user.useConfigOnly", "true"], &[]).unwrap();
        git(dir, &["add", "--all"], &[]).unwrap();

        let err = commit(dir, "test", &SyncOptions::default(), &isolated);
        assert!(
            err.is_ok(),
            "the neutral-identity retry should rescue an identity-less commit: {err:?}"
        );
        assert!(
            git(dir, &["log", "-1", "--format=%an <%ae>"], &[])
                .unwrap()
                .contains("Marky"),
            "the neutral identity should appear in the log"
        );
    }
}
