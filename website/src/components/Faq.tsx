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
    <section id="faq" className="mx-auto max-w-[1440px] px-6 py-20 md:px-10 md:py-28">
      <div
        ref={headingRef}
        className="reveal flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p className="kicker">Questions</p>
          <h2 className="display mt-4 max-w-[15ch] text-[clamp(36px,8vw,64px)]">
            The things people ask first.
          </h2>
        </div>
        <p className="max-w-[26rem] font-display text-[18px] leading-[1.5] text-ink-soft">
          Mostly about where the files live and what talks to the network. Short answers, and none
          of them are “it depends”.
        </p>
      </div>

      {/* Discrete cards rather than a divided list. The page body is ruled paper
          — a 1px repeating gradient — so hairline dividers laid straight onto it
          collided with the ruling. Each card carries its own solid surface, which
          covers the rules, and a card that opens only resizes its own column. */}
      <div ref={listRef} className="reveal mt-10 grid gap-4 md:mt-14 lg:grid-cols-2 lg:items-start">
        {FAQ.map(({ q, a }) => (
          <details
            key={q}
            className="faq-item group rounded-md border border-line bg-surface transition-colors duration-200 hover:border-ink/20"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-[16px] font-medium leading-snug md:px-6 md:py-5 md:text-[17px]">
              {q}
              <span className="grid size-7 shrink-0 place-items-center rounded-pill border border-line text-ink-faint transition-transform duration-300 group-open:rotate-45">
                <Plus size={15} strokeWidth={2} aria-hidden />
              </span>
            </summary>
            <p className="px-5 pb-5 text-[15px] leading-[1.65] text-ink-soft md:px-6 md:pb-6">
              <Answer text={a} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
