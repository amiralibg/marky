import { useEffect } from "react";

/**
 * Drops the ruled-paper background for as long as the calling page is mounted.
 * The ruling reads as stationery behind prose and as noise behind a data table,
 * so the admin panel turns it off and the marketing pages keep it.
 */
export function usePlainCanvas() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-canvas", "plain");
    return () => root.removeAttribute("data-canvas");
  }, []);
}
