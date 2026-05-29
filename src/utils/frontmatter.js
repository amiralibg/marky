const FRONTMATTER_BOUNDARY = "---";

const isBoundary = (line) => line.trim() === FRONTMATTER_BOUNDARY;

const normalizeKey = (key) =>
  (key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

const escapeQuotedValue = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const parseScalar = (rawValue) => {
  const value = (rawValue || "").trim();
  if (!value) return "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return value;
};

const parseInlineList = (value) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  return inner
    .split(",")
    .map((item) => parseScalar(item.trim()))
    .filter(Boolean);
};

const stringifyScalar = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/[:#[\]{},&*!|>'"%@`\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${escapeQuotedValue(text)}"`;
  }
  return text;
};

const normalizeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const parseFrontmatter = (content = "") => {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (!isBoundary(lines[0] || "")) {
    return {
      attributes: {},
      body: normalized,
      hasFrontmatter: false,
      raw: "",
    };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && isBoundary(line));
  if (endIndex === -1) {
    return {
      attributes: {},
      body: normalized,
      hasFrontmatter: false,
      raw: "",
    };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const attributes = {};
  let currentKey = null;

  frontmatterLines.forEach((line) => {
    const listItem = /^\s*-\s+(.+)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(attributes[currentKey])) {
        attributes[currentKey] = attributes[currentKey] ? [attributes[currentKey]] : [];
      }
      attributes[currentKey].push(parseScalar(listItem[1]));
      return;
    }

    const pair = /^([A-Za-z0-9_-][A-Za-z0-9_\s-]*):\s*(.*)$/.exec(line);
    if (!pair) return;

    currentKey = normalizeKey(pair[1]);
    if (!currentKey) return;

    const rawValue = pair[2] || "";
    const inlineList = parseInlineList(rawValue);
    attributes[currentKey] = inlineList !== null ? inlineList : parseScalar(rawValue);
  });

  return {
    attributes,
    body: lines.slice(endIndex + 1).join("\n"),
    hasFrontmatter: true,
    raw: frontmatterLines.join("\n"),
  };
};

export const stringifyFrontmatter = (attributes = {}) => {
  const lines = [];

  Object.entries(attributes).forEach(([rawKey, value]) => {
    const key = normalizeKey(rawKey);
    if (!key) return;

    if (Array.isArray(value)) {
      const list = normalizeList(value);
      if (list.length === 0) return;
      lines.push(`${key}:`);
      list.forEach((item) => {
        lines.push(`  - ${stringifyScalar(item)}`);
      });
      return;
    }

    const scalar = stringifyScalar(value);
    if (!scalar) return;
    lines.push(`${key}: ${scalar}`);
  });

  return lines.join("\n");
};

export const writeFrontmatter = (content = "", attributes = {}) => {
  const parsed = parseFrontmatter(content);
  const serialized = stringifyFrontmatter(attributes);
  const body = parsed.body || "";

  if (!serialized) {
    return body.replace(/^\n+/, "");
  }

  return `${FRONTMATTER_BOUNDARY}\n${serialized}\n${FRONTMATTER_BOUNDARY}\n${body.replace(/^\n*/, "")}`;
};

export const getNoteProperties = (content = "") => {
  const parsed = parseFrontmatter(content);
  const attributes = parsed.attributes || {};

  return {
    attributes,
    aliases: normalizeList(attributes.aliases || attributes.alias),
    tags: normalizeList(attributes.tags),
    status: typeof attributes.status === "string" ? attributes.status : "",
    type: typeof attributes.type === "string" ? attributes.type : "",
    hasFrontmatter: parsed.hasFrontmatter,
  };
};

export const mergeNoteProperties = (content = "", properties = {}) => {
  const parsed = parseFrontmatter(content);
  const currentAttributes = parsed.attributes || {};
  const nextAttributes = {
    ...currentAttributes,
    aliases: normalizeList(properties.aliases),
    status: properties.status || "",
    type: properties.type || "",
    tags: normalizeList(properties.tags),
  };

  delete nextAttributes.alias;

  return writeFrontmatter(content, nextAttributes);
};
