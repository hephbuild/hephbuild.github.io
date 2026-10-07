# playground-proxy

A Cloudflare Worker that lets the website's `/playground` page download heph
release assets. GitHub serves release downloads without CORS headers, so the
browser can't fetch them directly.

```
GET https://heph-playground-proxy.<account>.workers.dev/heph-release?https://github.com/hephbuild/heph-artifacts-v1/releases/download/<tag>/<asset>
```

## Abuse and cost

Cloudflare doesn't bill Worker bandwidth; the costs are requests and CPU time.

| Guard | Effect |
|-------|--------|
| Workers **Free** plan | A hard daily request cap: abuse can take the proxy down until the next day, it can never produce a bill. Keep the account on Free unless you need more. |
| Origin allowlist (`allowed_origins`) | Requests without an allowed `Origin` — other sites, bare `curl` — are refused before any fetch. |
| Per-IP rate limit (`requests_per_minute`) | Checked before any fetch; over the limit gets a 429. |
| Target allowlist | Only `hephbuild/heph-artifacts-v1` release assets; nothing else can be proxied. |
| `cache-control: immutable`, 1 year | Browsers keep every asset; the playground also stores them, so a returning visitor makes no requests. |
| `cpu_ms` (paid plan) | Caps CPU per request. Piping bytes needs almost none. |

With a `custom_domain`, the edge cache also kicks in: each asset is fetched
from GitHub once per data center (the Cache API does nothing on workers.dev).
That saves GitHub round-trips, not Worker requests — every request still runs
the Worker.

## Deploy

Needs an API token with *Workers Scripts: Edit* on the account (plus *Workers
Custom Domains: Edit* and the zone's *DNS: Edit* for a custom domain).

```sh
export CLOUDFLARE_API_TOKEN=...
terraform init
terraform apply \
  -var account_id=<account id> \
  -var workers_dev_subdomain=<name in name.workers.dev>
```

Then set `PLAYGROUND_PROXY` in `website/src/constants.ts` to the
`proxy_prefix` output. State is local (`terraform.tfstate`, gitignored); add a
`backend` block to keep it elsewhere.
