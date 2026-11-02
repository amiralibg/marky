import { useState } from "react";
import { useReveal } from "../lib/motion";

type Shot = {
  id: string;
  label: string;
  caption: string;
  alt: string;
};

// Every image is 1800x1125, from a 1440x900 capture of the app itself; the
// width/height below match so the browser reserves the space.
const SHOT_W = 1800;
const SHOT_H = 1125;

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
    caption: "Read draws Mermaid diagrams and KaTeX maths where you wrote them.",
    alt: "A note in Read view with a rendered Mermaid flow diagram and a KaTeX equation",
  },
  {
    id: "source",
    label: "Source",
    caption: "The same note in Source. What you see here is what sits in the file.",
    alt: "The same note in Source view showing the raw Mermaid fence and dollar-delimited maths",
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
    caption: "A daily note in Live view, with its tasks and wiki links, created for you on a schedule.",
    alt: "A daily note dated 2026-08-18 in Live view, with completed and open task checkboxes and wiki links",
  },
  {
    id: "themes",
    label: "Themes",
    caption: "Fifteen themes and three typefaces. Picking one repaints the app straight away.",
    alt: "Marky's appearance settings showing theme previews and the Sans, Serif and Mixed typeface picker",
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
          Every shot is Marky running on a demo vault, in Vault and Vault Dark. Thirteen other
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
            width={SHOT_W}
            height={SHOT_H}
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
