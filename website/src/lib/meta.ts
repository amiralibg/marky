import { useEffect } from "react";
import type { Route } from "../routes";

const SITE = "https://marky.amiralibg.xyz";

/** The tag index.html ships with, restored whenever a real route is shown. */
const DEFAULT_ROBOTS =
  typeof document === "undefined"
    ? ""
    : (document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");

function setMeta(selector: string, value: string) {
  document.querySelector(selector)?.setAttribute("content", value);
}

/**
 * Keeps the head in step with the route. index.html ships the home page's tags,
 * which is what unfurlers and crawlers that do not run scripts will read; this
 * corrects them for anyone who navigates within the site, so a shared URL from
 * the address bar matches the page that was open.
 */
export function useDocumentMeta(route: Route) {
  useEffect(() => {
    // Unknown paths still come back as 200 index.html — that is what makes
    // client-side routing work — so the not-found page has to say for itself
    // that it should not be indexed, and must not claim a canonical URL.
    const missing = route.path === "*";
    const url = missing ? window.location.href : `${SITE}${route.path === "/" ? "/" : route.path}`;

    document.title = route.title;
    setMeta('meta[name="description"]', route.description);
    setMeta('meta[name="robots"]', missing ? "noindex, follow" : DEFAULT_ROBOTS);
    setMeta('meta[property="og:title"]', route.title);
    setMeta('meta[property="og:description"]', route.description);
    setMeta('meta[property="og:url"]', url);
    setMeta('meta[name="twitter:title"]', route.title);
    setMeta('meta[name="twitter:description"]', route.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (missing) canonical?.removeAttribute("href");
    else canonical?.setAttribute("href", url);
  }, [route]);
}
