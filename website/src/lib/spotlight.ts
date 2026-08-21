import { useEffect, useState } from "react";
import type { FeatureId } from "../components/featureData";
import { HOME } from "../routes";
import { navigate, readLocation, scrollToId } from "./router";

/**
 * Which feature card is lit up, held outside React because the command palette
 * picks a feature while the home page — the only thing that renders one — may
 * not be mounted. Lifting it into App instead would mean threading the state
 * through every route just so one of them can read it.
 */
let current: FeatureId | null = null;
const listeners = new Set<(value: FeatureId | null) => void>();

export function useSpotlight() {
  const [value, setValue] = useState<FeatureId | null>(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export function selectFeature(id: FeatureId) {
  if (readLocation().path !== HOME.path) navigate(HOME.path);

  if (id === "graph") {
    scrollToId("graph", { smooth: true });
    return;
  }

  current = id;
  for (const listener of listeners) listener(current);

  scrollToId("features", { smooth: true });
  // Second hop: the section first, so the move reads as one gesture, then the
  // card itself once the page has settled on the section.
  window.setTimeout(() => scrollToId(`feature-${id}`, { smooth: true, block: "center" }), 280);
}
