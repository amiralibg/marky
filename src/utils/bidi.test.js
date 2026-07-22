import { describe, it, expect } from "vitest";
import { detectBaseDirection, isRTLLine, findIsolateRuns, isolateBidiRuns } from "./bidi";

const runsOf = (text, base) => findIsolateRuns(text, base).map((r) => text.slice(r.start, r.end));

describe("detectBaseDirection", () => {
  it("uses the first strong character", () => {
    expect(detectBaseDirection("Hello سلام")).toBe("ltr");
    expect(detectBaseDirection("سلام Hello")).toBe("rtl");
  });

  it("skips leading neutrals", () => {
    expect(detectBaseDirection("«سلام» hello")).toBe("rtl");
    expect(detectBaseDirection("  — (Hello) سلام")).toBe("ltr");
  });

  it("defaults to ltr with no strong characters", () => {
    expect(detectBaseDirection("123 — !?")).toBe("ltr");
    expect(detectBaseDirection("")).toBe("ltr");
    expect(isRTLLine("123")).toBe(false);
  });
});

describe("findIsolateRuns", () => {
  it("finds RTL runs inside an LTR line", () => {
    expect(runsOf("hero sub-line reads «برای هر کسی» with", "ltr")).toEqual(["برای هر کسی"]);
  });

  it("finds LTR runs inside an RTL line", () => {
    expect(runsOf("سلام dashboard settings است", "rtl")).toEqual(["dashboard settings"]);
  });

  it("trims neutral characters from the edges of a run", () => {
    // The guillemets and the trailing period stay outside so they resolve
    // against the base direction instead of flipping to the other side.
    expect(runsOf("reads «برای هر کسی».", "ltr")).toEqual(["برای هر کسی"]);
  });

  it("keeps interior spaces and commas inside a run", () => {
    expect(runsOf("mix (مشاور، مدرس خصوصی، خیاط) here", "ltr")).toEqual([
      "مشاور، مدرس خصوصی، خیاط",
    ]);
  });

  it("splits a breadcrumb on arrows in an LTR line", () => {
    expect(runsOf("Settings (/dashboard/settings → خدمات → ویرایش):", "ltr")).toEqual([
      "خدمات",
      "ویرایش",
    ]);
  });

  it("does not split a Latin phrase on arrows in an RTL line", () => {
    expect(runsOf("مسیر Settings → Services را باز کن", "rtl")).toEqual(["Settings → Services"]);
  });

  it("splits a spaced slash list in an LTR line", () => {
    expect(runsOf("roles are now سالن زیبایی / مشاور خانواده / مدرس زبان and", "ltr")).toEqual([
      "سالن زیبایی",
      "مشاور خانواده",
      "مدرس زبان",
    ]);
  });

  it("keeps an unspaced slash compound as one run", () => {
    expect(runsOf("includes the new مشاوره/کلاس/عکاسی terms.", "ltr")).toEqual([
      "مشاوره/کلاس/عکاسی",
    ]);
  });

  it("attaches digits that follow a strong character", () => {
    expect(runsOf("price قیمت 300 tomans", "ltr")).toEqual(["قیمت 300"]);
    // A leading number stays out of the run, which is what puts it on the
    // correct side once the run is isolated.
    expect(runsOf("price 300 قیمت here", "ltr")).toEqual(["قیمت"]);
  });

  it("separates runs split by strong characters of the base direction", () => {
    expect(runsOf("a سلام b خداحافظ c", "ltr")).toEqual(["سلام", "خداحافظ"]);
  });

  it("returns nothing for single-direction text", () => {
    expect(findIsolateRuns("plain english only", "ltr")).toEqual([]);
    expect(findIsolateRuns("فقط فارسی", "rtl")).toEqual([]);
    expect(findIsolateRuns("", "ltr")).toEqual([]);
  });
});

describe("isolateBidiRuns", () => {
  const render = (html) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  };

  it("wraps RTL runs of an LTR paragraph in <bdi>", () => {
    const root = render('<p dir="auto">Marquee shows «مشاور و مدرس» and scrolls.</p>');
    isolateBidiRuns(root);
    expect(root.querySelectorAll("bdi")).toHaveLength(1);
    expect(root.querySelector("bdi").textContent).toBe("مشاور و مدرس");
    expect(root.textContent).toBe("Marquee shows «مشاور و مدرس» and scrolls.");
  });

  it("leaves pure-LTR documents untouched", () => {
    const root = render("<p>nothing to isolate here</p>");
    isolateBidiRuns(root);
    expect(root.querySelectorAll("bdi")).toHaveLength(0);
  });

  it("does not touch code blocks", () => {
    const root = render('<pre><code>const x = "سلام" + "hi";</code></pre>');
    isolateBidiRuns(root);
    expect(root.querySelectorAll("bdi")).toHaveLength(0);
  });

  it("does not wrap a text node that is entirely one run", () => {
    const root = render('<p dir="auto">hello <strong>سلام</strong> there</p>');
    isolateBidiRuns(root);
    // <strong> already isolates it; adding a <bdi> inside would be redundant.
    expect(root.querySelectorAll("bdi")).toHaveLength(0);
  });

  it("preserves the full text content of a mixed document", () => {
    const source = "Pick «سایر» or skip category → no template chips.";
    const root = render(`<li dir="auto">${source}</li>`);
    isolateBidiRuns(root);
    expect(root.textContent).toBe(source);
  });
});
