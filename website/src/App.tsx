import { useEffect, useState } from "react";
import CommandPalette from "./components/CommandPalette";
import Download from "./components/Download";
import Features from "./components/Features";
import Footer from "./components/Footer";
import Gallery from "./components/Gallery";
import GraphSection from "./components/GraphSection";
import Hero from "./components/Hero";
import McpSection from "./components/McpSection";
import Nav from "./components/Nav";
import type { FeatureId } from "./components/featureData";
import { detectPlatform, refineArch, type DetectedPlatform } from "./lib/platform";
import { fetchLatestRelease, type ReleaseInfo } from "./lib/releases";
import { applyTheme, oppositeTheme, readTheme, type Theme } from "./lib/theme";

export default function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [platform, setPlatform] = useState<DetectedPlatform>(() =>
    typeof navigator === "undefined"
      ? { os: "macos", arch: "arm64", label: "macOS", archLabel: "Apple Silicon" }
      : detectPlatform()
  );
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [spotlight, setSpotlight] = useState<FeatureId | null>(null);

  useEffect(() => {
    const next = readTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    void refineArch(detectPlatform()).then(setPlatform);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchLatestRelease()
      .then((info) => {
        if (!cancelled) setRelease(info);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load release");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleTheme = () => {
    const next = oppositeTheme(theme);
    setTheme(next);
    applyTheme(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (key === "escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectFeature = (id: FeatureId) => {
    if (id === "graph") {
      document.getElementById("graph")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setSpotlight(id);
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => {
      document
        .getElementById(`feature-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 280);
  };

  return (
    <>
      <Nav onOpenPalette={() => setPaletteOpen(true)} theme={theme} onToggleTheme={toggleTheme} />
      <main>
        <Hero release={release} platform={platform} loading={loading} error={error} />
        <Features spotlight={spotlight} />
        <Gallery />
        <GraphSection active={spotlight} onSelect={selectFeature} />
        <McpSection />
        <Download release={release} platform={platform} />
      </main>
      <Footer />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectFeature={selectFeature}
        onToggleTheme={toggleTheme}
        theme={theme}
      />
    </>
  );
}
