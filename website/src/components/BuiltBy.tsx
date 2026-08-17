type Props = {
  className?: string;
};

export default function BuiltBy({ className = "" }: Props) {
  return (
    <p className={`flex flex-wrap items-center gap-2.5 text-[16px] text-ink/55 ${className}`}>
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
          width={32}
          height={32}
          loading="lazy"
          className="size-8 rounded-pill object-cover border border-ink/10 shadow-sm"
        />
        amiralibgi
      </a>
    </p>
  );
}
