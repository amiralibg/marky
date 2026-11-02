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
    <section id="graph" className="section-x scroll-mt-16 py-20 md:py-28">
      <div ref={ref} className="reveal grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
        <h2 className="display text-[clamp(36px,6.5vw,72px)]">See the vault as a graph.</h2>
        <p className="lede max-w-[34rem]">
          Every wiki link you write becomes an edge. Hover a note to light up its neighbours, click
          one to open it, or export the whole map as an image. It comes into its own once a vault
          has a few hundred notes in it.
        </p>
      </div>
      <div className="mt-10 md:mt-14">
        <GraphField active={active} onSelect={onSelect} />
      </div>
    </section>
  );
}
