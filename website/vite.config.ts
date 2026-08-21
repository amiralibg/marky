import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { FAQ, plainAnswer } from "./src/components/faqData";
import { toEntries, type ChangelogEntry, type GithubReleasePayload } from "./src/lib/changelog";
import { ROUTES } from "./src/routes";

const SITE = "https://marky.amiralibg.xyz";
const REPO = "amiralibg/marky";

/**
 * Every release, for the changelog snapshot and the SoftwareApplication schema.
 * Deliberately best-effort: unauthenticated GitHub allows 60 calls an hour per
 * IP, and a CI box that has burnt through them — or has no network at all —
 * must still produce a site. A miss drops the version fields and ships an empty
 * snapshot, which the changelog page then fills from the API in the browser.
 */
async function fetchReleases(): Promise<ChangelogEntry[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "marky-website-build" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const json = (await res.json()) as GithubReleasePayload[];
    if (!Array.isArray(json) || json.length === 0) throw new Error("no releases in response");
    return toEntries(json);
  } catch (err) {
    console.warn(
      `[marky-seo] no release metadata: ${err instanceof Error ? err.message : err}. ` +
        "Building without the changelog snapshot or softwareVersion/datePublished."
    );
    return [];
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const longDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

function seo(): Plugin {
  // Fetched once per build and shared by both hooks, whichever runs first.
  let releases: Promise<ChangelogEntry[]> = Promise.resolve([]);

  return {
    name: "marky-seo",
    // Build only: dev reloads should not hit the GitHub API every save.
    apply: "build",

    buildStart() {
      releases = fetchReleases();
    },

    async transformIndexHtml(html) {
      let out = html;

      // --- FAQPage schema, generated from the same list the section renders ---
      const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": `${SITE}/#faq`,
        mainEntity: FAQ.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: plainAnswer(a) },
        })),
      };
      out = out.replace(
        "</head>",
        `  <script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n    </script>\n  </head>`
      );

      const entries = await releases;

      // --- Version metadata onto the existing SoftwareApplication node --------
      // Parsed and re-serialised rather than string-patched: the block is valid
      // JSON, so editing it as JSON cannot produce a subtly malformed graph.
      // The MCP server is versioned separately, so only the app's own releases
      // can answer "what version is this application".
      const latest = entries.find((entry) => entry.channel === "app" && !entry.prerelease);
      if (latest) {
        out = out.replace(
          /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
          (whole, open: string, body: string, close: string) => {
            try {
              const graph = JSON.parse(body);
              const app = graph["@graph"]?.find(
                (n: { "@type"?: string }) => n["@type"] === "SoftwareApplication"
              );
              if (!app) return whole;
              app.softwareVersion = latest.version;
              if (latest.date) app.datePublished = latest.date;
              app.releaseNotes = `${SITE}/changelog`;
              return `${open}\n${JSON.stringify(graph, null, 2)}\n    ${close}`;
            } catch {
              return whole;
            }
          }
        );
      }

      // --- noscript mirror of the FAQ ----------------------------------------
      const noscriptFaq = FAQ.map(
        ({ q, a }) =>
          `          <dt><strong>${escapeHtml(q)}</strong></dt>\n          <dd>${escapeHtml(plainAnswer(a))}</dd>`
      ).join("\n");
      out = out.replace(
        "<!-- FAQ:NOSCRIPT -->",
        `<h2>Questions</h2>\n        <dl>\n${noscriptFaq}\n        </dl>`
      );

      // --- noscript mirror of the recent releases -----------------------------
      // /changelog is client-rendered from the same data, so without this a
      // crawler that does not run scripts sees an empty page there.
      const recent = entries.slice(0, 10);
      out = out.replace(
        "<!-- RELEASES:NOSCRIPT -->",
        recent.length
          ? `<h2>Recent releases</h2>\n        <ul>\n${recent
              .map(
                (entry) =>
                  `          <li><a href="${escapeHtml(entry.url)}">${escapeHtml(
                    entry.channel === "mcp"
                      ? `MCP server ${entry.version}`
                      : `Marky ${entry.version}`
                  )}</a> — ${escapeHtml(longDate(entry.date))}</li>`
              )
              .join(
                "\n"
              )}\n        </ul>\n        <p><a href="/changelog">The full changelog</a>.</p>`
          : `<p><a href="/changelog">The full changelog</a>.</p>`
      );

      return out;
    },

    async generateBundle() {
      const entries = await releases;

      // The changelog page's first paint. It refreshes from the GitHub API in
      // the background, so this only has to be right as of the last deploy.
      this.emitFile({
        type: "asset",
        fileName: "releases.json",
        source: JSON.stringify({ generatedAt: new Date().toISOString(), entries }),
      });

      // lastmod tracks the build, which for this site is the deploy. There is
      // nothing more granular to track — and a real date beats the hand-edited
      // one that was here before and went stale.
      const lastmod = new Date().toISOString().slice(0, 10);
      const urls = ROUTES.map(
        (route) => `  <url>
    <loc>${SITE}${route.path === "/" ? "/" : route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
      ).join("\n");

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seo()],
});
