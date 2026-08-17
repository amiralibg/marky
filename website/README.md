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

## Download matching

Assets are classified from the **filename**, not a hardcoded list, so renamed builds still work if they include:

- OS: `mac` / `darwin` / `win` / `linux`, or a format like `.dmg` `.exe` `.msi` `.AppImage` `.deb` `.rpm`
- Arch: `arm64` `aarch64` `amd64` `x64` `x86_64`
- Skip: `.sig`, `latest.json`, `.app.tar.gz` updater bundles
