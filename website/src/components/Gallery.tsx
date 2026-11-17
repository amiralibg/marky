import { useState } from "react";
import { useReveal } from "../lib/motion";

type Shot = {
  id: string;
  label: string;
  caption: string;
  alt: string;
  width: number;
  height: number;
};

// Cut from Retina window captures of the app on a demo vault. Width and height
// match each file so the browser reserves the space before it loads.
const SHOTS: Shot[] = [
  {
    id: "live",
    label: "Live",
    caption: "A roadmap note in Live: the Markdown formats as you type, and the syntax steps back.",
    alt: "Marky in the light Vault theme: a roadmap note in Live view with a checklist, wiki links and a code block, beside the vault sidebar",
    width: 1800,
    height: 1125,
  },
  {
    id: "read",
    label: "Read",
    caption:
      "Read, set in Newsreader. Footnotes number themselves and wiki links read as plain links.",
    alt: "A long-form note titled Notes on Deep Work in Read view, set in a serif face, with a numbered footnote",
    width: 1080,
    height: 675,
  },
  {
    id: "source",
    label: "Source",
    caption: "Source shows exactly what sits in the file: front matter, a Mermaid fence and TeX.",
    alt: "A note in Source view showing its front matter, a raw Mermaid fence and dollar-delimited maths",
    width: 1080,
    height: 675,
  },
  {
    id: "math",
    label: "Diagrams & maths",
    caption: "The same note in Read: Mermaid draws the diagram and KaTeX sets the equation.",
    alt: "The same note in Read view with a rendered Mermaid flow diagram and a KaTeX equation",
    width: 1080,
    height: 675,
  },
  {
    id: "daily",
    label: "Daily notes",
    caption: "Today’s daily note in Vault Dark, created for you from a template.",
    alt: "A daily note in the dark Vault theme, with checked and open tasks and wiki links",
    width: 1080,
    height: 675,
  },
  {
    id: "graph",
    label: "Graph",
    caption: "The whole vault as a graph. Drag to pan, scroll to zoom, click a node to open it.",
    alt: "Marky's note graph in the dark theme, showing fourteen notes and their connections",
    width: 1080,
    height: 675,
  },
  {
    id: "themes",
    label: "Appearance",
    caption:
      "Sixteen themes, three typefaces and the translucent window, all in one settings page.",
    alt: "Marky's appearance settings with light theme previews, the translucent window switch and the Sans, Serif and Mixed typeface picker",
    width: 1080,
    height: 675,
  },
];

export default function Gallery() {
  const headingRef = useReveal<HTMLDivElement>();
  const frameRef = useReveal<HTMLDivElement>();
  const [active, setActive] = useState(SHOTS[0].id);

  const shot = SHOTS.find((item) => item.id === active) ?? SHOTS[0];

  return (
    <section id="screenshots" className="section-x scroll-mt-16 py-20 md:py-28">
      <div
        ref={headingRef}
        className="reveal grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16"
      >
        <h2 className="display text-[clamp(36px,6.5vw,72px)]">Straight from the app.</h2>
        <p className="lede max-w-[34rem]">
          Every shot is Marky running on a demo vault, in Vault and Vault Dark. Fourteen other
          themes ship with it.
        </p>
      </div>

      <div className="seg mt-10 md:mt-14" role="group" aria-label="Choose a screenshot">
        {SHOTS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === active}
            onClick={() => setActive(item.id)}
            className="seg-btn"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div ref={frameRef} className="reveal mt-5">
        <figure className="m-0">
          <img
            // Re-keying restarts the fade, so switching shots does not read as
            // pixels mutating in place.
            key={shot.id}
            src={`/screenshots/${shot.id}.webp`}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            loading="lazy"
            decoding="async"
            className="swap-in shot w-full"
          />
          <figcaption className="mt-4 max-w-[46rem] text-[14px] leading-6 text-ink-soft">
            {shot.caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
