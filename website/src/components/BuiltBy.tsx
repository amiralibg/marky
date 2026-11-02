type Props = {
  className?: string;
};

export default function BuiltBy({ className = "" }: Props) {
  return (
    <p className={`flex flex-wrap items-center gap-2.5 text-[14px] text-ink-faint ${className}`}>
      <span>Built by</span>
      <a
        href="https://x.com/_amiralibgi"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 font-medium text-ink underline decoration-ink/35 underline-offset-4 transition-colors duration-200 hover:decoration-ink"
      >
        <img
          src="/amirali.jpg"
          alt=""
          width={24}
          height={24}
          loading="lazy"
          className="size-6 rounded-pill object-cover outline outline-1 -outline-offset-1 outline-ink/10"
        />
        amiralibgi
      </a>
    </p>
  );
}
