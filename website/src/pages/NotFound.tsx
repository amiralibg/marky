import { Link } from "../lib/router";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[1440px] px-6 py-24 md:px-10 md:py-32">
      <p className="kicker">404</p>
      <h1 className="display mt-4 max-w-[14ch] text-[clamp(40px,8vw,72px)]">
        There is no page here.
      </h1>
      <p className="mt-6 max-w-[30rem] font-display text-[18px] leading-[1.5] text-ink-soft">
        The link may be from an older version of the site, or a typo. The pages that do exist are
        one click away.
      </p>
      <div className="mt-8 flex flex-wrap gap-3 text-[14px]">
        <Link
          to="/"
          className="btn-accent inline-flex h-10 items-center rounded-sm px-4 font-medium"
        >
          Back to the start
        </Link>
        <Link
          to="/changelog"
          className="inline-flex h-10 items-center rounded-sm border border-line bg-surface px-4 font-medium text-ink-soft hover:text-ink"
        >
          Changelog
        </Link>
      </div>
    </main>
  );
}
