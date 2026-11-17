import { describe, expect, it } from "vitest";
import {
  buildFrameDocument,
  contentSecurityPolicy,
  documentBaseHref,
  pathFromDocumentUrl,
  sandboxFor,
} from "./htmlFrame";
import { buildSourceMap } from "./htmlSourceMap";

const ORIGIN = "marky-doc://localhost";
const BASE = `${ORIGIN}/k3y/Projects/`;

const parse = (html) => new DOMParser().parseFromString(html, "text/html");

const cspOf = (srcdoc) => {
  const doc = parse(srcdoc);
  return doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content");
};

describe("sandboxFor", () => {
  it("never grants same-origin, popups or top navigation", () => {
    for (const value of [sandboxFor("preview"), sandboxFor("edit"), sandboxFor("miniature")]) {
      expect(value).not.toMatch(/same-origin|popups|top-navigation|forms|modals|downloads/);
    }
    // Preview carries allow-scripts with or without the document's scripts:
    // with them off, the policy runs only the agent (see the CSP tests).
    expect(sandboxFor("preview")).toBe("allow-scripts");
    expect(sandboxFor("edit")).toBe("allow-scripts");
    expect(sandboxFor("miniature")).toBe("");
  });
});

describe("contentSecurityPolicy", () => {
  it("leaves out the app's own schemes and plain http", () => {
    for (const kind of ["preview", "edit", "miniature"]) {
      const policy = contentSecurityPolicy(kind, { documentOrigin: ORIGIN, nonce: "n" });
      expect(policy).not.toMatch(/asset:|ipc:|tauri:|\bhttp:(?!\/\/(localhost|127\.0\.0\.1))/);
      // Plugins are off everywhere (the miniature's default-src 'none' covers them).
      expect(policy).toMatch(/object-src 'none'|^default-src 'none'/);
    }
  });

  it("runs only the nonce'd agent in Edit", () => {
    const policy = contentSecurityPolicy("edit", { documentOrigin: ORIGIN, nonce: "abc" });
    expect(policy).toContain("script-src 'nonce-abc'");
    expect(policy).not.toContain("unsafe-inline' 'unsafe-eval");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("connect-src 'none'");
  });

  it("runs only the nonce'd agent in Preview with scripts off", () => {
    const policy = contentSecurityPolicy("preview", {
      documentOrigin: ORIGIN,
      nonce: "abc",
      runScripts: false,
    });
    expect(policy).toContain("script-src 'nonce-abc'");
    expect(policy).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("connect-src 'none'");
  });

  it("lets a miniature load nothing from the network", () => {
    const policy = contentSecurityPolicy("miniature", { documentOrigin: ORIGIN });
    expect(policy).toMatch(/^default-src 'none'/);
    expect(policy).not.toContain("https:");
  });

  it("keeps nested data: and blob: frames out of Preview", () => {
    const policy = contentSecurityPolicy("preview", { documentOrigin: ORIGIN });
    const frameSrc = policy.split("; ").find((d) => d.startsWith("frame-src"));
    expect(frameSrc).toBe(`frame-src https: ${ORIGIN}`);
  });
});

describe("buildFrameDocument", () => {
  const report =
    '<!doctype html>\n<html><head><script>window.ran = true</script><title>R</title></head><body><h1>Q3</h1><p class=lead>Text</p><img src="chart.png"></body></html>';

  it("puts the policy before the document's first script, right after the doctype", () => {
    const srcdoc = buildFrameDocument(report, {
      kind: "preview",
      baseHref: BASE,
      documentOrigin: ORIGIN,
      channel: "c",
    });
    expect(srcdoc.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(
      true
    );
    expect(srcdoc.indexOf("Content-Security-Policy")).toBeLessThan(srcdoc.indexOf("window.ran"));
    const doc = parse(srcdoc);
    expect(doc.compatMode).toBe("CSS1Compat");
    expect(doc.querySelector("base").getAttribute("href")).toBe(BASE);
    expect(doc.head.firstElementChild.getAttribute("http-equiv")).toBe("Content-Security-Policy");
  });

  it("injects at the start when there is no doctype, and drops the BOM", () => {
    const srcdoc = buildFrameDocument("﻿<p>Hi</p>", { kind: "preview", baseHref: BASE });
    expect(srcdoc.startsWith("<meta http-equiv")).toBe(true);
    expect(srcdoc).not.toContain("﻿");
  });

  it("injects at the very start when markup precedes the doctype", () => {
    const srcdoc = buildFrameDocument("<script>x()</script><!doctype html><p>a</p>", {
      kind: "preview",
    });
    expect(srcdoc.startsWith("<meta http-equiv")).toBe(true);
  });

  it("adds the preview agent, nonce'd when the document's scripts are off", () => {
    const on = buildFrameDocument(report, { kind: "preview", runScripts: true, channel: "ch1" });
    const off = buildFrameDocument(report, {
      kind: "preview",
      runScripts: false,
      channel: "ch1",
      nonce: "n1",
    });
    expect(on).toContain('"channel":"ch1"');
    expect(parse(on).querySelector("script[nonce]")).toBeNull();
    expect(off).toContain('"channel":"ch1"');
    const agent = parse(off).querySelector("script[nonce]");
    expect(agent.getAttribute("nonce")).toBe("n1");
    expect(cspOf(off)).toContain("script-src 'nonce-n1'");
  });

  it("hands the agents the app's shortcuts", () => {
    const shortcuts = [{ key: "b", shift: false, alt: false }];
    const preview = buildFrameDocument(report, { kind: "preview", channel: "c", shortcuts });
    const edit = buildFrameDocument(report, {
      kind: "edit",
      channel: "c",
      nonce: "n",
      shortcuts,
      format: { bold: { key: "b", shift: true, alt: false } },
    });
    expect(preview).toContain('"shortcuts":[{"key":"b","shift":false,"alt":false}]');
    expect(edit).toContain('"format":{"bold":{"key":"b","shift":true,"alt":false}}');
  });

  it("hides the page's scrollbars in every kind of frame, scripts or not", () => {
    for (const options of [
      { kind: "preview", runScripts: true },
      { kind: "preview", runScripts: false },
      { kind: "edit", nonce: "n" },
      { kind: "miniature" },
    ]) {
      const srcdoc = buildFrameDocument(report, options);
      const style = [...parse(srcdoc).querySelectorAll("style")].map((s) => s.textContent);
      expect(style.join("")).toContain("scrollbar-width:none!important");
      expect(style.join("")).toContain("::-webkit-scrollbar{display:none!important");
      // In the head, ahead of the document's own markup.
      expect(srcdoc.indexOf("scrollbar-width")).toBeLessThan(srcdoc.indexOf("window.ran"));
    }
    // Render-time only: nothing of it is part of the source.
    expect(report).not.toContain("scrollbar");
  });

  it("gives only blocks the text cursor in Edit", () => {
    const srcdoc = buildFrameDocument("<!doctype html><div>loose<p>Para</p></div>", {
      kind: "edit",
      nonce: "n",
    });
    const css = [...parse(srcdoc).querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css).toContain("html,html *{cursor:default!important}");
    expect(css).toContain("[data-marky-b],[data-marky-b] *{cursor:text!important}");
  });

  it("aims every link at a refused popup when scripts are off", () => {
    const source =
      '<a href="https://x.test" target="_self">x</a><a href="y.html" target=frame>y</a>';
    const srcdoc = buildFrameDocument(source, {
      kind: "preview",
      runScripts: false,
      baseHref: BASE,
    });
    const doc = parse(srcdoc);
    expect(doc.querySelector("base").getAttribute("target")).toBe("_blank");
    expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("target"))).toEqual([
      "_blank",
      "_blank",
    ]);
  });

  it("disables meta refresh in the frame", () => {
    const srcdoc = buildFrameDocument(
      '<meta http-equiv="refresh" content="0;url=https://evil.test"><p>a</p>',
      { kind: "preview" }
    );
    const doc = parse(srcdoc);
    expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(doc.querySelector("meta[data-marky-http-equiv]")).not.toBeNull();
  });

  it("keeps a document's own absolute base", () => {
    const srcdoc = buildFrameDocument('<base href="https://cdn.test/"><img src="a.png">', {
      kind: "preview",
      baseHref: BASE,
    });
    const doc = parse(srcdoc);
    expect(doc.querySelector("base").getAttribute("href")).toBe("https://cdn.test/");
  });

  it("never lets a document end the agent's script element early", () => {
    const srcdoc = buildFrameDocument("<p>a</p>", {
      kind: "preview",
      channel: "</script><script>alert(1)</script>",
    });
    const doc = parse(srcdoc);
    expect(doc.querySelectorAll("script").length).toBe(1);
  });

  it("marks every editable block in Edit with its source id, and unsound ones locked", () => {
    const source = "<table><p>stray</p><tr><td>cell</td></tr></table><P CLASS=x>Para</P>";
    const map = buildSourceMap(source);
    const srcdoc = buildFrameDocument(source, { kind: "edit", nonce: "n1", channel: "c", map });
    const doc = parse(srcdoc);
    const marked = [...doc.querySelectorAll("[data-marky-b]")];
    expect(marked.map((el) => Number(el.getAttribute("data-marky-b")))).toEqual(
      expect.arrayContaining(map.blocks.map((b) => b.id))
    );
    const stray = map.blocks.find((b) => b.tag === "p" && !b.sound);
    expect(doc.querySelector(`[data-marky-b="${stray.id}"]`).getAttribute("data-marky-lock")).toBe(
      "moved-by-parser"
    );
    // Attributes written as they were, after Marky's.
    expect(doc.querySelector("p.x")).not.toBeNull();
    // The agent carries the nonce; the policy allows only it.
    expect(doc.querySelector("script").getAttribute("nonce")).toBe("n1");
    expect(cspOf(srcdoc)).toContain("'nonce-n1'");
  });

  it("gives each block in the Edit frame the children the source map serialises", () => {
    // The frame reports `innerHTML` with Marky's markers removed; that must be
    // what the patcher checks against, or every edit would be refused.
    const source =
      "﻿<!doctype html>\r\n<p>Fish &amp; chips &mdash; ok<br>next</p>\r\n<ul><li>One<li>Two <b>bold</b></ul>\r\n<table><tr><td>A<td>B</table>";
    const map = buildSourceMap(source);
    const doc = parse(buildFrameDocument(source, { kind: "edit", nonce: "n", map }));
    for (const block of map.blocks) {
      const element = doc.querySelector(`[data-marky-b="${block.id}"]`);
      const copy = element.cloneNode(true);
      copy.querySelectorAll("[data-marky-b]").forEach((el) => el.removeAttribute("data-marky-b"));
      expect(copy.innerHTML).toBe(map.serializeInner(block.id));
    }
  });

  it("builds a miniature with no script at all", () => {
    const srcdoc = buildFrameDocument(report, {
      kind: "miniature",
      baseHref: BASE,
      documentOrigin: ORIGIN,
    });
    expect(cspOf(srcdoc)).toMatch(/^default-src 'none'/);
    expect(srcdoc).not.toContain("previewFrameAgent");
    expect(srcdoc).not.toContain("channel");
  });
});

describe("document scheme URLs", () => {
  it("encodes each folder segment so relative URLs resolve like on disk", () => {
    expect(documentBaseHref(ORIGIN, "k", "Projects/Q3 #1")).toBe(`${ORIGIN}/k/Projects/Q3%20%231/`);
    expect(documentBaseHref(ORIGIN, "k", "")).toBe(`${ORIGIN}/k/`);
    expect(documentBaseHref("", "k", "x")).toBe("");
  });

  it("maps a frame URL back to a vault path, and nothing outside", () => {
    const root = "/Users/me/Vault";
    expect(
      pathFromDocumentUrl(`${ORIGIN}/k/Projects/Other%20doc.html#top`, ORIGIN, "k", root)
    ).toBe("/Users/me/Vault/Projects/Other doc.html");
    expect(pathFromDocumentUrl(`${ORIGIN}/other/x.html`, ORIGIN, "k", root)).toBeNull();
    expect(pathFromDocumentUrl(`${ORIGIN}/k/%2E%2E/secret.html`, ORIGIN, "k", root)).toBeNull();
    expect(pathFromDocumentUrl(`${ORIGIN}/k/a%2Fb.html`, ORIGIN, "k", root)).toBeNull();
    expect(pathFromDocumentUrl("https://example.com/k/x.html", ORIGIN, "k", root)).toBeNull();
    expect(pathFromDocumentUrl("not a url", ORIGIN, "k", root)).toBeNull();
  });
});
