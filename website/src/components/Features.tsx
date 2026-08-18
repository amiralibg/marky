import { useCallback, useRef, useState } from "react";
import { FEATURES, type Feature, type FeatureId, type NoteTone } from "./featureData";
import { useFinePointer, useReveal } from "../lib/motion";

const STOCK: Record<NoteTone, string> = {
  butter: "bg-note-butter",
  mint: "bg-note-mint",
  sky: "bg-note-sky",
  blush: "bg-note-blush",
  lilac: "bg-note-lilac",
  cream: "bg-note-cream",
};

type Offset = { x: number; y: number };

type NoteProps = {
  feature: Feature;
  index: number;
  lit: boolean;
  draggable: boolean;
  offset: Offset | undefined;
  onDrag: (id: FeatureId, offset: Offset) => void;
  onLift: () => void;
  z: number;
};

function StickyNote({ feature, index, lit, draggable, offset, onDrag, onLift, z }: NoteProps) {
  const ref = useReveal<HTMLElement>();
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || event.button !== 0) return;
    onLift();
    setDragging(true);
    start.current = {
      px: event.clientX,
      py: event.clientY,
      ox: offset?.x ?? 0,
      oy: offset?.y ?? 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    onDrag(feature.id, {
      x: s.ox + (event.clientX - s.px),
      y: s.oy + (event.clientY - s.py),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <article
      ref={ref}
      id={`feature-${feature.id}`}
      data-dragging={dragging || undefined}
      className={`note ${STOCK[feature.tone]} p-6 pb-9 text-ink ${
        feature.wide ? "xl:col-span-2" : ""
      } ${lit ? "outline outline-2 outline-offset-4 outline-ink" : ""}`}
      style={
        {
          "--note-tilt": `${feature.tilt}deg`,
          "--note-dx": `${offset?.x ?? 0}px`,
          "--note-dy": `${offset?.y ?? 0}px`,
          "--note-delay": `${index * 70}ms`,
          zIndex: z || undefined,
        } as React.CSSProperties
      }
    >
      {/* Real sticky notes are gummed along the top edge, so that is the grab
          handle. Dragging from the body would fight text selection. */}
      <div
        className={draggable ? "note-grip -mx-6 -mt-6 mb-1 flex h-7 items-center px-6" : "hidden"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-hidden
      >
        <span className="h-1 w-8 rounded-pill bg-ink/15" />
      </div>

      <p className="kicker">{feature.kicker}</p>
      <h3 className="mt-3 font-display text-[26px] leading-[1.1] tracking-[-0.03em] md:text-[30px]">
        {feature.title}
      </h3>
      <p className="mt-3 max-w-[34rem] text-[15.5px] leading-[1.55] text-ink/75">{feature.body}</p>
    </article>
  );
}

type Props = {
  spotlight: FeatureId | null;
};

export default function Features({ spotlight }: Props) {
  const headingRef = useReveal<HTMLDivElement>();
  const draggable = useFinePointer();
  const [offsets, setOffsets] = useState<Partial<Record<FeatureId, Offset>>>({});
  const [order, setOrder] = useState<FeatureId[]>([]);
  const [nudged, setNudged] = useState(false);

  const onDrag = useCallback((id: FeatureId, offset: Offset) => {
    setNudged(true);
    setOffsets((prev) => ({ ...prev, [id]: offset }));
  }, []);

  const lift = useCallback((id: FeatureId) => {
    setOrder((prev) => [...prev.filter((item) => item !== id), id]);
  }, []);

  const tidy = () => {
    setOffsets({});
    setOrder([]);
    setNudged(false);
  };

  return (
    <section id="features" className="mx-auto max-w-[1440px] px-6 py-20 md:px-10 md:py-28">
      <div
        ref={headingRef}
        className="reveal flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <h2 className="display max-w-[16ch] text-[clamp(36px,8vw,72px)]">A vault, not a feed.</h2>
        <div className="max-w-[28rem]">
          <p className="font-display text-[18px] leading-[1.5] text-ink-soft">
            Files on disk. Wiki links between them. Search when the titles slip. Everything stays on
            your machine.
          </p>
          {draggable && (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              {nudged ? (
                <button
                  type="button"
                  onClick={tidy}
                  className="underline underline-offset-4 hover:text-ink"
                >
                  Tidy the board
                </button>
              ) : (
                "Drag a note by its top edge"
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-5 md:mt-14 md:grid-cols-2 xl:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <StickyNote
            key={feature.id}
            feature={feature}
            index={index}
            lit={spotlight === feature.id}
            draggable={draggable}
            offset={offsets[feature.id]}
            onDrag={onDrag}
            onLift={() => lift(feature.id)}
            z={order.indexOf(feature.id) + 1}
          />
        ))}
      </div>
    </section>
  );
}
