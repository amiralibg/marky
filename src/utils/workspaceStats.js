export const countWords = (text = "") => text.trim().split(/\s+/).filter(Boolean).length;

const stripCodeBlocks = (content = "") =>
  content.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");

const extractTags = (content = "") => {
  const tagRegex = /(?:^|[\s])#([a-zA-Z0-9_-]+)(?=[\s.,;!?)]|$)/g;
  const tags = [];
  let match;

  while ((match = tagRegex.exec(stripCodeBlocks(content))) !== null) {
    tags.push(match[1].toLowerCase());
  }

  return tags;
};

const stripExtension = (name = "") => name.replace(/\.(md|markdown|txt)$/i, "") || name;

const buildLinkKey = (value = "") => stripExtension(value).trim().toLowerCase();

const extractWikiLinks = (content = "") => {
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  let match;

  while ((match = wikiLinkRegex.exec(stripCodeBlocks(content))) !== null) {
    const [targetRaw] = match[1].trim().split("|");
    const key = buildLinkKey(targetRaw);
    if (key) links.push(key);
  }

  return [...new Set(links)];
};

const getNoteLinkKeys = (note) =>
  note.links?.length
    ? note.links.map((link) => link.key).filter(Boolean)
    : extractWikiLinks(note.content || "");

export const calculateWorkspaceStats = (notes, referenceDate = new Date()) => {
  const noteKeys = new Set(notes.map((note) => buildLinkKey(note.name)).filter(Boolean));
  const incomingCounts = new Map();
  const tagCounts = new Map();
  const brokenLinks = new Map();
  const sevenDaysAgo = referenceDate.getTime() - 7 * 86400000;
  let outgoingLinkCount = 0;
  let recentlyUpdatedCount = 0;
  let latestUpdatedAt = null;

  notes.forEach((note) => {
    const noteTags = note.tags?.length ? note.tags : extractTags(note.content || "");
    noteTags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));

    const noteLinks = getNoteLinkKeys(note);
    outgoingLinkCount += noteLinks.length;

    noteLinks.forEach((key) => {
      if (noteKeys.has(key)) {
        incomingCounts.set(key, (incomingCounts.get(key) || 0) + 1);
      } else {
        brokenLinks.set(key, (brokenLinks.get(key) || 0) + 1);
      }
    });

    const updatedAt = note.updatedAt || note.createdAt;
    const updatedTime = updatedAt ? new Date(updatedAt).getTime() : null;
    if (updatedTime && !Number.isNaN(updatedTime)) {
      if (updatedTime >= sevenDaysAgo) recentlyUpdatedCount += 1;
      if (!latestUpdatedAt || updatedTime > new Date(latestUpdatedAt).getTime()) {
        latestUpdatedAt = updatedAt;
      }
    }
  });

  const orphanCount = notes.filter((note) => {
    const key = buildLinkKey(note.name);
    const outgoingLinks = getNoteLinkKeys(note);
    return outgoingLinks.length === 0 && !incomingCounts.has(key);
  }).length;

  return {
    brokenLinkCount: brokenLinks.size,
    latestUpdatedAt,
    orphanCount,
    recentlyUpdatedCount,
    topTags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((first, second) => second.count - first.count || first.tag.localeCompare(second.tag))
      .slice(0, 6),
    wikiLinkCount: outgoingLinkCount,
  };
};
