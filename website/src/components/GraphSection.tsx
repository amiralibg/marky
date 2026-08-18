import GraphField from "./GraphField";
import { useReveal } from "../lib/motion";
import type { FeatureId } from "./featureData";

type Props = {
  active: FeatureId | null;
  onSelect: (id: FeatureId) => void;
};

export default function GraphSection({ active, onSelect }: Props) {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="graph" className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-24">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
        <div ref={ref} className="reveal">
          <p className="kicker">Graph view</p>
          <h2 className="display mt-4 text-[clamp(36px,8vw,64px)]">See the vault as a graph.</h2>
          <p className="mt-5 max-w-[30rem] font-display text-[18px] leading-[1.5] text-ink-soft">
            Every wiki link you write becomes an edge. Hover a note to light up its neighbours,
            click one to open it, or export the whole map as an image. It comes into its own once a
            vault has a few hundred notes in it.
          </p>
        </div>
        <GraphField active={active} onSelect={onSelect} />
      </div>
    </section>
  );
}
