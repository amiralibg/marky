import type { ComponentType } from "react";
import Admin from "./Admin";
import Changelog from "./Changelog";
import Feedback from "./Feedback";
import Home from "./Home";
import NotFound from "./NotFound";

/**
 * Path → page. Kept apart from src/routes.ts because that file is plain data
 * that vite.config.ts imports to build the sitemap, and it cannot pull React
 * components into the build config to do it.
 */
export const PAGES: Record<string, ComponentType> = {
  "/": Home,
  "/changelog": Changelog,
  "/feedback": Feedback,
  // Not in ROUTES on purpose: a moderation panel should not be in the sitemap
  // or the nav, and meta.ts noindexes only unknown paths.
  "/admin": Admin,
};

export { NotFound };
