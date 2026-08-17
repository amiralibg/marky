import { FEATURES, type Feature, type FeatureId } from "./featureData";

const TONE: Record<Feature["tone"], string> = {
  paper: "bg-surface text-ink",
  marigold: "bg-marigold text-ink",
  moss: "bg-moss text-ink",
  dusk: "bg-dusk text-surface",
  sky: "bg-sky text-ink",
};

type Props = {
  spotlight: FeatureId | null;
};

export default function Features({ spotlight }: Props) {
  return (
    <section id="features" className="mx-auto max-w-[1440px] px-6 py-20 md:px-10 md:py-28">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h2 className="display max-w-[16ch] text-[clamp(36px,8vw,72px)]">A vault, not a feed.</h2>
        <p className="max-w-[28rem] font-display text-[18px] leading-[1.5] text-ink-soft">
          Files on disk. Wiki links between them. Search when the titles slip. Everything stays on
          your machine.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((feature, index) => {
          const wide = index === 0 || index === 2;
          const lit = spotlight === feature.id;
          return (
            <article
              key={feature.id}
              id={`feature-${feature.id}`}
              className={`rounded-md p-6 transition-[transform,outline-color] duration-200 ${TONE[feature.tone]} ${
                wide ? "md:col-span-2" : ""
              } ${lit ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}
            >
              <p className={`kicker ${feature.tone === "dusk" ? "text-surface/50" : ""}`}>
                {feature.kicker}
              </p>
              <h3 className="mt-4 font-display text-[26px] leading-[1.1] tracking-[-0.03em] md:text-[32px]">
                {feature.title}
              </h3>
              <p
                className={`mt-3 max-w-[36rem] text-[16px] leading-[1.5] ${
                  feature.tone === "dusk" ? "text-surface/70" : "text-ink/70"
                }`}
              >
                {feature.body}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
