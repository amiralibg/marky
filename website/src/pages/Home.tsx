import { useEffect, useState } from "react";
import Download from "../components/Download";
import Faq from "../components/Faq";
import Features from "../components/Features";
import Gallery from "../components/Gallery";
import GraphSection from "../components/GraphSection";
import Hero from "../components/Hero";
import McpSection from "../components/McpSection";
import { detectPlatform, refineArch, type DetectedPlatform } from "../lib/platform";
import { fetchLatestRelease, type ReleaseInfo } from "../lib/releases";
import { useInitialHashScroll } from "../lib/router";
import { selectFeature, useSpotlight } from "../lib/spotlight";

export default function Home() {
  const [platform, setPlatform] = useState<DetectedPlatform>(() =>
    typeof navigator === "undefined"
      ? { os: "macos", arch: "arm64", label: "macOS", archLabel: "Apple Silicon" }
      : detectPlatform()
  );
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const spotlight = useSpotlight();

  // A pasted /#download cannot be honoured by the browser: at load, #root is
  // still empty and the section it names does not exist yet.
  useInitialHashScroll(true);

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

  return (
    <main>
      <Hero release={release} platform={platform} loading={loading} error={error} />
      <Features spotlight={spotlight} />
      <Gallery />
      <GraphSection active={spotlight} onSelect={selectFeature} />
      <McpSection />
      <Download release={release} platform={platform} />
      <Faq />
    </main>
  );
}
