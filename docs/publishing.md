# Publishing

## Release target

- App: Tokyo by Rail, version `1.0.1`.
- Repository: public `tanishksharma/tokyo-by-rail`.
- Production: `https://tokyorail.tanishk.ai` from `main`.
- Staging: `https://tokyorail-staging.tanishk.ai` from `staging`.
- Vercel project: `tokyo-by-rail`, `prj_iHuihb5bv2Gm3uStyxIOpr0wEnY6`, team `tanishksharmas-projects`; Git integration builds pushed commits.
- Production domain and staging branch domain: configured and ownership verified. Validate each deployed release before calling it live.
- No unified menu in this release.

## Build and review

1. Build the static site and offline inventory with `node scripts/build-app.mjs offline-remote.json`.
2. Serve `dist` over HTTP for local review, such as `cd dist && python3 -m http.server 4173`.
3. Review at 420 × 747 and 1440 × 900. Check trains, station details and map, filters, sorting, saved hearts, and the version display.
4. Check first-online-load installation readiness, then launch offline and change filters and open station details.
5. Confirm offline data includes `stations.json` and `map.svg`. Online-only melody links need an internet connection.

## Release flow

- Keep deployment source limited to the app; the build excludes `docs`, scripts, and project instructions.
- Fetch and rebase the intended files onto the target branch. Preserve unrelated changes; do not force-push.
- A staging push is authorized for a small, self-contained change after review. Confirm the Vercel build and check the staging alias when configured.
- Production publication requires a direct human request. Push an approved release to `main` only after that request.
- The Vercel Git integration starts builds on push. A successful push alone does not confirm a successful build, domain routing, or deployment.

## Data, storage, and offline use

- Train and station data are bundled in `stations.json`; the diagram is `map.svg`. There is no calculator or app backend.
- Saved hearts use `localStorage.hearted`. `localStorage.rail-counts` stores the latest counts downloaded from Supabase; neither creates an offline write queue.
- Online reads use the Supabase project `ndgzwmyqnldlkmjwlmwr.supabase.co` and the `rail_line_likes` and `rail_app_opens` tables. The `rail-like` and `rail-open` Edge Functions accept online-origin traffic only from the production site. Staging and local previews do not submit these writes.
- The service worker caches core resources in CacheStorage, including the configured Facet CSS and JavaScript and font assets. Facet stays live online; no Facet library copy is vendored. Browser storage can be cleared or evicted. A later online visit can download current content-hashed assets and rebuild the offline cache.
- The browser install helper needs one online visit until it reports “Ready for offline use”. Use the native install prompt when available. On iPhone or iPad, use Share → Add to Home Screen. On Safari for Mac, use File → Add to Dock. Follow the browser's manual install instructions elsewhere.

## Version and rollback

- Keep `version.json`, the visible app version, release record, and Git tag aligned at `1.0.1` / `v1.0.1` for this release.
- Record each later release and create a matching `vX.Y.Z` tag.
- To roll back, redeploy the prior known-ready Vercel deployment, then align the branch source with that release in the next approved change.

## Limits

- Shared hearts, opening counts, and melody links need an internet connection.
- Native phone installation: owner device check pending. Live-release evidence belongs in the private publishing report.

## Publication report

- Generate the private release review with `node scripts/publish-review.mjs --sourceDirectory dist --liveBase https://tokyorail.tanishk.ai/ --outputPath /absolute/private/path/review.html`.
- Report source commit, observed live release, links, metadata, assets, headers, and pending manual checks. Keep the report outside deployment output.
- Website discovery: https://tanishk.ai/explore#mini-app-store. Legacy website calculator paths redirect to the independent app roots with query inputs preserved.
- Collective workflow: https://app.notion.com/p/390b4fa1867c8111a265e5efd081e9ba.
