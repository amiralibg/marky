import { useEffect, useState } from "react";
import CommandPalette from "./components/CommandPalette";
import Footer from "./components/Footer";
import Nav from "./components/Nav";
import { useDocumentMeta } from "./lib/meta";
import { useLocation } from "./lib/router";
import { applyTheme, oppositeTheme, readTheme, type Theme } from "./lib/theme";
import { NotFound, PAGES } from "./pages";
import { findRoute } from "./routes";

/** `path: "*"` is the marker useDocumentMeta reads to add noindex. */
const NOT_FOUND = {
  path: "*",
  title: "Page not found — Marky",
  description: "That page does not exist on the Marky site.",
  priority: "0.0",
  changefreq: "yearly",
};

export default function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { path } = useLocation();

  const Page = PAGES[path] ?? NotFound;
  const route = findRoute(path) ?? NOT_FOUND;
  useDocumentMeta(route);

  useEffect(() => {
    const next = readTheme();
    setTheme(next);
    applyTheme(next);
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

  return (
    <>
      <Nav
        onOpenPalette={() => setPaletteOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        path={path}
      />
      <Page />
      <Footer />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggleTheme={toggleTheme}
        theme={theme}
      />
    </>
  );
}
