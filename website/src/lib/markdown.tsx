import type { ReactNode } from "react";

/**
 * A small Markdown renderer for GitHub release notes.
 *
 * It covers what the notes actually use — headings, nested bullet lists, bold,
 * inline code, fenced code, links — and nothing else. A full parser would be
 * three times the weight of the rest of this site's JavaScript, and the output
 * here is React elements rather than an HTML string, so nothing needs
 * dangerouslySetInnerHTML and the page's strict CSP stays intact.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

type ListItem = { text: string; children: Block[] };

const MARKER = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const indentOf = (line: string) => /^\s*/.exec(line)![0].length;
const isBlank = (line: string) => line.trim() === "";

function parseList(lines: string[], start: number, baseIndent: number): [Block, number] {
  const items: ListItem[] = [];
  const ordered = /^\s*\d+[.)]\s/.test(lines[start]);
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      // A blank line ends the list unless the next content is another item of
      // it — release notes space their bullets out inconsistently.
      let peek = i;
      while (peek < lines.length && isBlank(lines[peek])) peek += 1;
      if (peek >= lines.length) break;
      const match = MARKER.exec(lines[peek]);
      if (!match || indentOf(lines[peek]) < baseIndent) break;
      i = peek;
      continue;
    }

    const indent = indentOf(line);
    if (indent < baseIndent) break;

    const match = MARKER.exec(line);

    if (match && indent === baseIndent) {
      items.push({ text: match[3], children: [] });
      i += 1;
      continue;
    }

    if (!items.length) break;
    const current = items[items.length - 1];

    if (match && indent > baseIndent) {
      const [nested, next] = parseList(lines, i, indent);
      current.children.push(nested);
      i = next;
      continue;
    }

    // An indented line that is not a marker continues the item above it, which
    // is how every wrapped bullet in these notes is written.
    if (indent > baseIndent) {
      current.text += ` ${line.trim()}`;
      i += 1;
      continue;
    }

    break;
  }

  return [{ kind: "list", ordered, items }, i];
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = /^\s*```+\s*(\S*)/.exec(line);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence, or the end of the note
      blocks.push({ kind: "code", lang: fence[1] ?? "", code: code.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    if (MARKER.test(line)) {
      const [block, next] = parseList(lines, i, indentOf(line));
      blocks.push(block);
      i = next;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: quoted.join(" ").trim() });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !MARKER.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: "para", text: paragraph.join(" ") });
  }

  return blocks;
}

/**
 * One alternation rather than nested passes, so the first token to match wins
 * and a `**` inside a code span is never mistaken for bold. Built per call
 * because it is a /g regex and Inline() recurses into its own bold spans.
 */
const INLINE_PATTERN =
  "(`[^`]+`)|(!?\\[[^\\]]*\\]\\([^)\\s]+\\))|(\\*\\*[^*]+\\*\\*)|(\\*[^*\\n]+\\*)|(https?://[^\\s<>()]+)";

const CODE_CLASS = "rounded-sm bg-ink/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-ink";
const LINK_CLASS =
  "text-accent-text underline decoration-accent/40 underline-offset-2 hover:decoration-accent";

function anchor(href: string, label: ReactNode, key: number) {
  return (
    <a key={key} href={href} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
      {label}
    </a>
  );
}

export function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const pattern = new RegExp(INLINE_PATTERN, "g");
  let last = 0;
  let key = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [token] = match;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className={CODE_CLASS}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          <Inline text={token.slice(2, -2)} />
        </strong>
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("http")) {
      // Trailing punctuation belongs to the sentence, not to the URL.
      const trimmed = token.replace(/[.,;:!?]+$/, "");
      nodes.push(anchor(trimmed, trimmed.replace(/^https?:\/\//, ""), key));
      if (trimmed !== token) nodes.push(token.slice(trimmed.length));
    } else {
      const link = /^!?\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token)!;
      nodes.push(anchor(link[2], <Inline text={link[1] || link[2]} />, key));
    }

    key += 1;
    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

const HEADING_CLASS: Record<number, string> = {
  1: "font-display text-[26px] tracking-[-0.02em] text-ink",
  2: "font-display text-[22px] tracking-[-0.02em] text-ink",
  3: "kicker !text-ink/60",
};

function renderBlocks(blocks: Block[], keyPrefix = "b") {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (block.kind) {
      case "heading": {
        const Tag = (block.level <= 2 ? "h3" : "h4") as "h3" | "h4";
        return (
          <Tag key={key} className={`mt-7 first:mt-0 ${HEADING_CLASS[Math.min(block.level, 3)]}`}>
            <Inline text={block.text} />
          </Tag>
        );
      }
      case "para":
        return (
          <p key={key} className="mt-3 text-[15px] leading-[1.7] text-ink-soft first:mt-0">
            <Inline text={block.text} />
          </p>
        );
      case "code":
        return (
          <pre
            key={key}
            className="mt-4 overflow-x-auto rounded-sm border border-line bg-ink/[0.04] p-4 font-mono text-[13px] leading-[1.6] text-ink"
          >
            <code>{block.code}</code>
          </pre>
        );
      case "quote":
        return (
          <blockquote
            key={key}
            className="mt-4 border-l-2 border-accent/40 pl-4 text-[15px] leading-[1.7] text-ink-soft"
          >
            <Inline text={block.text} />
          </blockquote>
        );
      case "rule":
        return <hr key={key} className="mt-6 border-0 border-t border-line" />;
      case "list": {
        const Tag = block.ordered ? "ol" : "ul";
        return (
          <Tag
            key={key}
            className={`mt-3 space-y-2 pl-5 text-[15px] leading-[1.7] text-ink-soft marker:text-accent-text ${
              block.ordered ? "list-decimal" : "list-disc"
            }`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-1">
                <Inline text={item.text} />
                {item.children.length > 0 && (
                  <div className="[&>*]:mt-2">
                    {renderBlocks(item.children, `${key}-${itemIndex}`)}
                  </div>
                )}
              </li>
            ))}
          </Tag>
        );
      }
    }
  });
}

export function Markdown({ source }: { source: string }) {
  return <>{renderBlocks(parseMarkdown(source))}</>;
}
