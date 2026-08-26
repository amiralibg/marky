import { resolveAttachmentPath, baseNameOf } from "./attachments";

/**
 * Which notes use which attachment files.
 *
 * The scan is deliberately dumb and fast: pull every link-ish target out of a
 * note (`![a](t)`, `[t](t)`, `![[t]]`, `[[t]]`), hand each to the same resolver
 * the preview uses, and file the note under whatever absolute path comes back.
 * That means an embed written three different ways — relative, vault-root or
 * bare name — all count as a use of the same file, exactly like rendering does.
 */

const LINK_TARGET_RE = /(!?)\[\[([^\]]+)\]\]|\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const isWebTarget = (target) => /^(https?:|data:|mailto:|#)/i.test(target);

/**
 * Raw link targets in one note's markdown, deduplicated.
 * Wiki targets keep their alias/sizing suffix off; regular targets are
 * percent-decoded by the resolver itself.
 */
export const collectLinkTargets = (content) => {
  if (!content) return [];
  const targets = new Set();
  let match;
  LINK_TARGET_RE.lastIndex = 0;
  while ((match = LINK_TARGET_RE.exec(content)) !== null) {
    const target = (match[2] ?? match[3] ?? "").trim();
    if (!target || isWebTarget(target)) continue;
    // `![[note]]` wiki links point at notes, not media; only embeds
    // (`![[image.png]]`) address attachments. Plain `[]()` links can be either.
    const isWikiLink = match[1] !== "!";
    if (isWikiLink && !match[3]) continue;
    targets.add(target);
  }
  return [...targets];
};

/**
 * Map every attachment file to the notes that reference it.
 *
 * @param {Array<{id: string, name?: string, filePath: string|null, content: string}>} notes
 * @param {{ vaultRoot: string|null, knownPaths?: Set<string> }} ctx
 *   `knownPaths` (lowercased absolute paths) trims out references that resolve
 *   nowhere on disk — without it the resolver's best guess would be counted.
 * @returns {Map<string, Array<{id: string, name: string}>>} absolute path → referencing notes
 */
export const buildAttachmentUsageMap = (notes, { vaultRoot = null, knownPaths = null } = {}) => {
  const usage = new Map();
  if (!Array.isArray(notes)) return usage;

  const isKnown = (path) => !knownPaths || knownPaths.has(path.toLowerCase());

  for (const note of notes) {
    if (!note?.filePath || typeof note.content !== "string") continue;
    for (const target of collectLinkTargets(note.content)) {
      const resolved = resolveAttachmentPath(target, {
        notePath: note.filePath,
        vaultRoot,
      });
      if (!resolved || !isKnown(resolved)) continue;
      const entry = { id: note.id, name: note.name || baseNameOf(note.filePath) };
      const existing = usage.get(resolved);
      if (existing) {
        if (!existing.some((candidate) => candidate.id === entry.id)) existing.push(entry);
      } else {
        usage.set(resolved, [entry]);
      }
    }
  }

  return usage;
};
