# Deployment overview

Thin operator notes for shipping the SPA + allowlisted live-data proxy. Detailed Cloudflare Pages setup, free-tier limits, Function routes, cache TTLs, rollback, and “static-only” disable switches are tracked in [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) — do not treat this file as that runbook.

## Production shape (today)

The app deploys as a **Cloudflare Worker** with Vite static assets (`dist/`) plus `worker/proxy.ts` (`wrangler.jsonc`).

```bash
npm run deploy   # build + wrangler deploy
```

Local Worker preview: `npm run preview:worker`.

## Allowlisted browser proxies

| Browser prefix | Upstream |
| --- | --- |
| `/ftc-proxy` | `https://ftc-events.firstinspires.org` |
| `/ftcscout-proxy` | `https://api.ftcscout.org` |
| `/portfolio-lab-proxy` | `https://www.ftcportfoliolab.org` |
| `/ftc-scoring-proxy` | `https://ftc-scoring.firstinspires.org` |

The Worker accepts `GET`/`HEAD` on those prefixes only and never forwards arbitrary browser-supplied destinations. Static page views stay on the asset path (`run_worker_first` limited to proxy prefixes). Local Vite (`npm run dev` / `npm run preview`) mirrors the same prefixes.

## Related

- [architecture.md](architecture.md)
- README “Production (Cloudflare Workers)” section
- Issue [#38](https://github.com/The-Allsparks/ftc-team-analysis/issues/38) for hosting runbooks
