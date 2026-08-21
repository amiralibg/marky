# Marky website

Public download site for [Marky](https://github.com/amiralibg/marky). It reads installer links from the latest GitHub Release at runtime, so a new app version shows up here without rebuilding the site.

## Local

```bash
cd website
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm run build
npm run preview
```

## Docker (local)

From this folder:

```bash
docker compose up --build
```

- Site: http://localhost:8080
- Health: http://localhost:8080/health

## Dokploy (VPS)

Create a new **Application** pointing at this GitHub repo.

| Setting                         | Value                      |
| ------------------------------- | -------------------------- |
| Repository                      | `amiralibg/marky`          |
| Branch                          | `main`                     |
| Base directory / Docker context | `website`                  |
| Dockerfile                      | `Dockerfile`               |
| Port                            | `80`                       |
| Domain                          | e.g. `marky.amiralibg.xyz` |

No environment variables are required. Traefik should target container port **80**.

If Dokploy’s build context is the **repo root** instead, set:

- Docker context: `.`
- Dockerfile path: `website/Dockerfile`

…and change the Dockerfile `COPY` paths to `website/…`, or keep the base directory as `website` (preferred).

## Pages

The site is a small client-rendered app with its own history router — no
dependency, just `pushState` and a listener (`src/lib/router.tsx`). Nginx already
answers every unknown path with `index.html`, so a route needs no server change.

| Path         | Page                      |
| ------------ | ------------------------- |
| `/`          | `src/pages/Home.tsx`      |
| `/changelog` | `src/pages/Changelog.tsx` |

`Link` from `src/lib/router.tsx` is an ordinary `<a>` the router intercepts, so
modified clicks and right-click ▸ Copy Link Address still behave. Section links
are written against the home page — `/#download`, not `#download` — so they work
from any page.

### Adding a page

The feedback board is the next one, and it is three edits:

1. `src/pages/Feedback.tsx` — open with `<PageIntro>` so the heading block
   matches the changelog.
2. `src/routes.ts` — one entry with `path`, `title`, `description` and, to put
   it in the nav bar, `nav`. The sitemap and the `<title>`/canonical/OG tags
   follow from this automatically.
3. `src/pages/index.ts` — add it to the `PAGES` map.

Anything that needs a server — votes, posts, a board that people write to —
needs a backend of its own; this container serves static files only. Reading
from GitHub Discussions or Issues in the browser, the way the changelog reads
from releases, needs nothing new.

## Changelog

`/changelog` renders the GitHub release notes. Two sources, in order:

- `/releases.json`, written at build time by the `marky-seo` plugin in
  `vite.config.ts`. It gives the page something to draw immediately and keeps it
  working when GitHub's anonymous limit — 60 requests an hour per IP — is spent.
- The releases API, fetched in the background. Anything published since the last
  deploy shows up without rebuilding, and a failure here is silent because the
  snapshot is already on screen.

Notes are rendered by `src/lib/markdown.tsx`, a ~250-line renderer covering what
the notes actually use: headings, nested bullets, bold, inline and fenced code,
links. It builds React elements, so there is no `dangerouslySetInnerHTML` and the
CSP stays strict. A tag prefixed `mcp-` is filed under the MCP server rather than
the app.

## Download matching

Assets are classified from the **filename**, not a hardcoded list, so renamed builds still work if they include:

- OS: `mac` / `darwin` / `win` / `linux`, or a format like `.dmg` `.exe` `.msi` `.AppImage` `.deb` `.rpm`
- Arch: `arm64` `aarch64` `amd64` `x64` `x86_64`
- Skip: `.sig`, `latest.json`, `.app.tar.gz` updater bundles
