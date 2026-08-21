import type { ComponentType } from "react";
import Changelog from "./Changelog";
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
};

export { NotFound };
