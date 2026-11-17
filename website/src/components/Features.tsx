import { FEATURES, type Feature, type FeatureId } from "./featureData";
import { useReveal } from "../lib/motion";

function FeatureCard({ feature, index, lit }: { feature: Feature; index: number; lit: boolean }) {
  const ref = useReveal<HTMLElement>();

  return (
    <article
      ref={ref}
      id={`feature-${feature.id}`}
      data-lit={lit || undefined}
      className="reveal feature-card flex flex-col p-6 md:p-7"
      // Three columns at most, so the stagger restarts every row.
      style={{ "--reveal-delay": `${(index % 3) * 70}ms` } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-medium text-ink-faint">{feature.kicker}</span>
        {feature.isNew && <span className="badge">New</span>}
      </div>
      <h3 className="mt-5 text-[21px] font-semibold leading-[1.2] tracking-[-0.018em] text-ink">
        {feature.title}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-ink-soft">{feature.body}</p>
    </article>
  );
}

type Props = {
  spotlight: FeatureId | null;
};

export default function Features({ spotlight }: Props) {
  const headingRef = useReveal<HTMLDivElement>();

  return (
    <section id="features" className="section-x scroll-mt-16 py-20 md:py-28">
      <div
        ref={headingRef}
        className="reveal grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16"
      >
        <h2 className="display text-[clamp(36px,6.5vw,72px)]">Built on files you already own.</h2>
        <p className="lede max-w-[34rem]">
          Nothing in here is a database row. You open a folder, you write Markdown, and Marky does
          the linking, searching and scheduling on top of it.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:mt-16 md:grid-cols-2 xl:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <FeatureCard
            key={feature.id}
            feature={feature}
            index={index}
            lit={spotlight === feature.id}
          />
        ))}
      </div>
    </section>
  );
}
