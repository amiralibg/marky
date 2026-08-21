import type { ReactNode } from "react";
import { useReveal } from "../lib/motion";

type Props = {
  kicker: string;
  title: string;
  lede: ReactNode;
  /** Sits under the lede — a filter row, a link back, a call to action. */
  aside?: ReactNode;
};

/**
 * The heading block every page below the home page opens with, so a new one —
 * the feedback board, next — lines up with the changelog without copying its
 * measurements around.
 */
export default function PageIntro({ kicker, title, lede, aside }: Props) {
  const ref = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="reveal flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
    >
      <div>
        <p className="kicker">{kicker}</p>
        <h1 className="display mt-4 max-w-[16ch] text-[clamp(40px,8vw,72px)]">{title}</h1>
      </div>
      <div className="max-w-[28rem] md:pb-2">
        <p className="font-display text-[18px] leading-[1.5] text-ink-soft">{lede}</p>
        {aside}
      </div>
    </div>
  );
}
