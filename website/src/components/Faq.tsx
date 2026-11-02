import { Plus } from "lucide-react";
import { useReveal } from "../lib/motion";
import { FAQ } from "./faqData";

/**
 * Renders the `backticked` spans in an answer as <code>. Splitting on a captured
 * group keeps the odd indices as the code spans, so no dangerous-HTML escape
 * hatch is needed for what is only ever inline formatting.
 */
function Answer({ text }: { text: string }) {
  return (
    <>
      {text.split(/`([^`]+)`/g).map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded-sm bg-ink/[0.06] px-1 py-0.5 font-mono text-[0.88em]">
            {part}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function Faq() {
  const headingRef = useReveal<HTMLDivElement>();
  const listRef = useReveal<HTMLDivElement>();

  return (
    <section id="faq" className="section-x scroll-mt-16 py-20 md:py-28">
      <div
        ref={headingRef}
        className="reveal grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16"
      >
        <h2 className="display text-[clamp(36px,6.5vw,72px)]">The things people ask first.</h2>
        <p className="lede max-w-[34rem]">
          Mostly about where the files live and what talks to the network. Short answers, and none
          of them are “it depends”.
        </p>
      </div>

      {/* A solid panel: hairline dividers laid straight onto the ruled paper
          collide with the ruling. */}
      <div ref={listRef} className="reveal paper-surface mt-10 px-5 md:mt-14 md:px-8">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="faq-item group border-b border-line last:border-b-0">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 py-4 text-[17px] font-medium leading-snug transition-colors duration-150 hover:text-accent-text">
              {q}
              <Plus
                size={16}
                strokeWidth={1.75}
                aria-hidden
                className="shrink-0 text-ink-faint transition-transform duration-200 group-open:rotate-45"
              />
            </summary>
            <p className="max-w-[46rem] pb-6 text-[15.5px] leading-[1.65] text-ink-soft">
              <Answer text={a} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
