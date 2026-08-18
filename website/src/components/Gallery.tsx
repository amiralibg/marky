import { useState } from "react";
import { useReveal } from "../lib/motion";

type Shot = {
  id: string;
  label: string;
  caption: string;
  alt: string;
};

// Every image is 1800x1122 (2x of a 900px display width), cropped to the window
// and rounded; the width/height below match so the browser reserves the space.
const SHOT_W = 1800;
const SHOT_H = 1122;

const SHOTS: Shot[] = [
  {
    id: "graph",
    label: "Graph",
    caption: "The whole vault as a graph. Drag to pan, scroll to zoom, click a node to open it.",
    alt: "Marky's note graph showing eight notes connected by twelve links, with Marky Roadmap as the largest node",
  },
  {
    id: "reading",
    label: "Reading",
    caption: "Reading view draws Mermaid diagrams and KaTeX maths where you wrote them.",
    alt: "A note in reading view with a rendered Mermaid flow diagram and a KaTeX equation",
  },
  {
    id: "source",
    label: "Source",
    caption: "The same note in source view. What you see here is what sits in the file.",
    alt: "The same note in source view showing the raw Mermaid fence and dollar-delimited maths",
  },
  {
    id: "code",
    label: "Code",
    caption: "Syntax highlighting and numbered footnotes, both on out of the box.",
    alt: "A note showing a highlighted Rust code block and a numbered footnote",
  },
  {
    id: "daily",
    label: "Daily notes",
    caption: "A daily note with its tasks and wiki links, created for you on a schedule.",
    alt: "A daily note dated 2026-08-17 with completed and open task checkboxes and a wiki link",
  },
  {
    id: "themes",
    label: "Themes",
    caption: "Ten themes and nine accent colours. Picking one repaints the app straight away.",
    alt: "Marky's appearance settings showing a grid of theme previews and a row of accent colour swatches",
  },
];

export default function Gallery() {
  const headingRef = useReveal<HTMLDivElement>();
  const frameRef = useReveal<HTMLDivElement>();
  const [active, setActive] = useState(SHOTS[0].id);

  const shot = SHOTS.find((item) => item.id === active) ?? SHOTS[0];

  return (
    <section id="screenshots" className="mx-auto max-w-[1440px] px-6 py-20 md:px-10 md:py-28">
      <div
        ref={headingRef}
        className="reveal flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="kicker">Screenshots</p>
          <h2 className="display mt-4 max-w-[14ch] text-[clamp(36px,8vw,64px)]">
            Straight from the app.
          </h2>
        </div>
        <p className="max-w-[26rem] font-display text-[18px] leading-[1.5] text-ink-soft">
          Every shot below is Marky running on a vault someone actually writes in. They are in a
          dark theme here; nine others ship with the app.
        </p>
      </div>

      <div
        className="mt-8 flex flex-wrap gap-2 md:mt-10"
        role="group"
        aria-label="Choose a screenshot"
      >
        {SHOTS.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setActive(item.id)}
              className={`min-h-10 rounded-pill px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                selected ? "bg-ink text-surface" : "border border-line text-ink/70 hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div ref={frameRef} className="reveal mt-5">
        <figure className="m-0">
          <img
            // Re-keying restarts the swap animation, so switching shots reads as
            // a new sheet being laid down rather than pixels mutating in place.
            key={shot.id}
            src={`/screenshots/${shot.id}.webp`}
            alt={shot.alt}
            width={SHOT_W}
            height={SHOT_H}
            loading="lazy"
            decoding="async"
            className="note-swap shot w-full"
          />
          <figcaption className="mt-4 max-w-[46rem] text-[15px] leading-6 text-ink-soft">
            {shot.caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
