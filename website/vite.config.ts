import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { FAQ, plainAnswer } from "./src/components/faqData";

const SITE = "https://marky.amiralibg.xyz";
const REPO = "amiralibg/marky";

type Release = { version: string; published: string };

/**
 * Latest release, for the SoftwareApplication schema. Deliberately best-effort:
 * unauthenticated GitHub allows 60 calls an hour per IP, and a CI box that has
 * burnt through them — or has no network at all — must still produce a site.
 * A miss drops the two version fields rather than failing the build.
 */
async function latestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "marky-website-build" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const json = (await res.json()) as { tag_name?: string; published_at?: string };
    if (!json.tag_name || !json.published_at) throw new Error("release JSON missing fields");
    return { version: json.tag_name.replace(/^v/, ""), published: json.published_at };
  } catch (err) {
    console.warn(
      `[marky-seo] no release metadata: ${err instanceof Error ? err.message : err}. ` +
        "Building without softwareVersion/datePublished."
    );
    return null;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function seo(): Plugin {
  return {
    name: "marky-seo",
    // Build only: dev reloads should not hit the GitHub API every save.
    apply: "build",

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

      // --- Version metadata onto the existing SoftwareApplication node --------
      // Parsed and re-serialised rather than string-patched: the block is valid
      // JSON, so editing it as JSON cannot produce a subtly malformed graph.
      const release = await latestRelease();
      if (release) {
        out = out.replace(
          /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
          (whole, open: string, body: string, close: string) => {
            try {
              const graph = JSON.parse(body);
              const app = graph["@graph"]?.find(
                (n: { "@type"?: string }) => n["@type"] === "SoftwareApplication"
              );
              if (!app) return whole;
              app.softwareVersion = release.version;
              app.datePublished = release.published;
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

      return out;
    },

    generateBundle() {
      // lastmod tracks the build, which for this site is the deploy. It is a
      // single page, so there is nothing more granular to track — and a real
      // date beats the hand-edited one that was here before and went stale.
      const lastmod = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seo()],
});
