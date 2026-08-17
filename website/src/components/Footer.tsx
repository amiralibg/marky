import BuiltBy from "./BuiltBy";
import { GITHUB_REPO_URL } from "../lib/releases";

export default function Footer() {
  return (
    <footer className="relative z-[1] border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-10 md:flex-row md:items-end md:justify-between md:px-10">
        <div>
          <p className="font-display text-[28px] tracking-[-0.03em]">Marky</p>
          <p className="mt-2 max-w-[28rem] text-[14px] leading-6 text-ink-soft">
            Offline-first Markdown notes. Native installers under 10 MB. MIT licensed.
          </p>
          <BuiltBy className="mt-5" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink/60">
          <a href="#download" className="hover:text-ink">
            Download
          </a>
          <a href="#graph" className="hover:text-ink">
            Graph
          </a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
            GitHub
          </a>
          <a
            href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink"
          >
            License
          </a>
        </div>
      </div>
    </footer>
  );
}
