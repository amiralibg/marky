import { describe, it, expect, beforeEach } from "vitest";
import {
  addIndexedAttachment,
  buildImageMarkdown,
  escapeMarkdownAlt,
  buildPastedImageName,
  buildRelativeLink,
  encodeAttachmentPath,
  isExternalSrc,
  isImagePath,
  joinPath,
  parseEmbedSize,
  resolveAttachmentPath,
  sanitizeAttachmentName,
  setAttachmentIndex,
  stripEmbedSize,
  withNameSuffix,
} from "./attachments";

const VAULT = "/Users/me/Vault";
const NOTE = `${VAULT}/Projects/Marky.md`;
const ctx = { notePath: NOTE, vaultRoot: VAULT };

describe("joinPath", () => {
  it("collapses . and .. segments", () => {
    expect(joinPath("/a/b/c", "../img.png")).toBe("/a/b/img.png");
    expect(joinPath("/a/b", "./x/y.png")).toBe("/a/b/x/y.png");
    expect(joinPath("/a/b", "../../top.png")).toBe("/top.png");
  });

  it("keeps a Windows drive prefix intact", () => {
    expect(joinPath("C:/Vault/Notes", "../img/a.png")).toBe("C:/Vault/img/a.png");
  });
});

describe("isExternalSrc", () => {
  it("passes through anything the webview can already load", () => {
    expect(isExternalSrc("https://example.com/a.png")).toBe(true);
    expect(isExternalSrc("data:image/png;base64,AAA")).toBe(true);
    expect(isExternalSrc("//cdn.example.com/a.png")).toBe(true);
  });

  it("treats a drive letter as a path, not a URL scheme", () => {
    expect(isExternalSrc("C:/Vault/a.png")).toBe(false);
    expect(isExternalSrc("attachments/a.png")).toBe(false);
  });
});

describe("resolveAttachmentPath", () => {
  beforeEach(() => {
    setAttachmentIndex(
      [
        { path: `${VAULT}/Projects/local.png` },
        { path: `${VAULT}/attachments/shot.png` },
        { path: `${VAULT}/attachments/my photo.png` },
        { path: `${VAULT}/deep/nested/dupe.png` },
        { path: `${VAULT}/dupe.png` },
      ],
      VAULT
    );
  });

  it("prefers a path relative to the note", () => {
    expect(resolveAttachmentPath("local.png", ctx)).toBe(`${VAULT}/Projects/local.png`);
  });

  it("falls back to a path relative to the vault root", () => {
    expect(resolveAttachmentPath("attachments/shot.png", ctx)).toBe(
      `${VAULT}/attachments/shot.png`
    );
  });

  it("resolves a bare name through the index, which is all an embed gives", () => {
    expect(resolveAttachmentPath("shot.png", ctx)).toBe(`${VAULT}/attachments/shot.png`);
  });

  it("decodes percent-escaped spaces", () => {
    expect(resolveAttachmentPath("attachments/my%20photo.png", ctx)).toBe(
      `${VAULT}/attachments/my photo.png`
    );
  });

  it("walks up out of the note's folder", () => {
    expect(resolveAttachmentPath("../attachments/shot.png", ctx)).toBe(
      `${VAULT}/attachments/shot.png`
    );
  });

  it("prefers the shallowest match when a name is ambiguous", () => {
    expect(resolveAttachmentPath("dupe.png", ctx)).toBe(`${VAULT}/dupe.png`);
  });

  it("ignores an embed's size suffix", () => {
    expect(resolveAttachmentPath("shot.png|300", ctx)).toBe(`${VAULT}/attachments/shot.png`);
  });

  it("keeps an absolute path as given", () => {
    expect(resolveAttachmentPath("/elsewhere/a.png", ctx)).toBe("/elsewhere/a.png");
  });

  it("guesses note-relative when nothing is indexed", () => {
    setAttachmentIndex([], VAULT);
    expect(resolveAttachmentPath("images/a.png", ctx)).toBe(`${VAULT}/Projects/images/a.png`);
  });

  it("still resolves after a file is added to the index", () => {
    addIndexedAttachment(`${VAULT}/later/fresh.png`);
    expect(resolveAttachmentPath("fresh.png", ctx)).toBe(`${VAULT}/later/fresh.png`);
  });
});

describe("embed sizing", () => {
  it("reads Obsidian's width and height suffixes", () => {
    expect(parseEmbedSize("a.png|300")).toEqual({ width: "300", height: "" });
    expect(parseEmbedSize("a.png|300x200")).toEqual({ width: "300", height: "200" });
    expect(parseEmbedSize("a.png|caption")).toBeNull();
    expect(parseEmbedSize("a.png")).toBeNull();
  });

  it("strips only a suffix that is actually a size", () => {
    expect(stripEmbedSize("a.png|300")).toBe("a.png");
    expect(stripEmbedSize("My Note|Alias")).toBe("My Note|Alias");
  });
});

describe("isImagePath", () => {
  it("recognises image extensions regardless of case", () => {
    expect(isImagePath("a/b/C.PNG")).toBe(true);
    expect(isImagePath("a.pdf")).toBe(false);
    expect(isImagePath("Note")).toBe(false);
  });
});

describe("buildRelativeLink", () => {
  it("links back up to a shared ancestor", () => {
    expect(buildRelativeLink(`${VAULT}/attachments/a.png`, NOTE)).toBe("../attachments/a.png");
  });

  it("links straight down when the file sits beside the note", () => {
    expect(buildRelativeLink(`${VAULT}/Projects/a.png`, NOTE)).toBe("a.png");
  });

  it("percent-encodes spaces so the markdown link doesn't break", () => {
    expect(buildRelativeLink(`${VAULT}/attachments/my photo.png`, NOTE)).toBe(
      "../attachments/my%20photo.png"
    );
  });

  it("falls back to the absolute path with no note to anchor to", () => {
    expect(buildRelativeLink(`${VAULT}/a.png`, null)).toBe(`${VAULT}/a.png`);
  });
});

describe("naming", () => {
  it("stamps a pasted image the way Obsidian does", () => {
    const name = buildPastedImageName("image/png", new Date(2026, 7, 19, 9, 5, 3));
    expect(name).toBe("Pasted image 20260819090503.png");
  });

  it("picks the extension from the mime type", () => {
    expect(buildPastedImageName("image/jpeg", new Date(2026, 0, 1))).toMatch(/\.jpg$/);
    expect(buildPastedImageName("", new Date(2026, 0, 1))).toMatch(/\.png$/);
  });

  it("strips path separators and reserved characters", () => {
    expect(sanitizeAttachmentName("../../etc/pass?wd.png")).toBe("passwd.png");
    expect(sanitizeAttachmentName("")).toBe("attachment");
  });

  it("counts up rather than overwriting", () => {
    expect(withNameSuffix("a.png", 0)).toBe("a.png");
    expect(withNameSuffix("a.png", 2)).toBe("a 2.png");
    expect(withNameSuffix("noext", 1)).toBe("noext 1");
  });
});

describe("encodeAttachmentPath", () => {
  it("encodes only what would end a markdown link target", () => {
    expect(encodeAttachmentPath("a b/c(d).png")).toBe("a%20b/c%28d%29.png");
    expect(encodeAttachmentPath("plain/file.png")).toBe("plain/file.png");
  });

  // macOS names every screenshot with a NARROW NO-BREAK SPACE (U+202F) before
  // the meridiem. It is not an ASCII space, so it used to survive encoding —
  // but the markdown tokenizer counts it as whitespace and ended the URL there,
  // which left the whole image sitting in the note as raw text.
  it("encodes the narrow no-break space in a macOS screenshot name", () => {
    const name = "Screenshot 2026-08-18 at 9.55.54\u202fPM.png";
    const encoded = encodeAttachmentPath(`attachments/${name}`);

    expect(encoded).toBe("attachments/Screenshot%202026-08-18%20at%209.55.54%E2%80%AFPM.png");
    expect(encoded).not.toMatch(/\s/u);
  });

  it("encodes every other flavour of unicode whitespace too", () => {
    for (const space of ["\u00a0", "\u2007", "\u2009", "\u3000"]) {
      expect(encodeAttachmentPath(`a${space}b.png`)).not.toMatch(/\s/u);
    }
  });

  it("round-trips back to the name on disk", () => {
    const name = "Screenshot 2026-08-18 at 9.55.54\u202fPM.png";
    expect(decodeURIComponent(encodeAttachmentPath(name))).toBe(name);
  });
});

describe("buildImageMarkdown", () => {
  const NOTE = "/Vault/Notes/Trip.md";

  it("builds a link the markdown parser can actually read", () => {
    const target = "/Vault/attachments/Screenshot 2026-08-18 at 9.55.54\u202fPM.png";
    expect(buildImageMarkdown(target, NOTE, "shot")).toBe(
      "![shot](../attachments/Screenshot%202026-08-18%20at%209.55.54%E2%80%AFPM.png)"
    );
  });

  it("escapes brackets in the alt text, which would end it early", () => {
    expect(escapeMarkdownAlt("a [b] c")).toBe("a \\[b\\] c");
    expect(buildImageMarkdown("/Vault/Notes/a.png", NOTE, "[draft]")).toBe("![\\[draft\\]](a.png)");
  });
});
