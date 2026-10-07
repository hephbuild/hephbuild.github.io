# CORS proxy for heph release assets, used by the website's /playground page.
# See README.md.

terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.27"
    }
  }
}

# Authenticates with the CLOUDFLARE_API_TOKEN environment variable.
provider "cloudflare" {}

resource "cloudflare_workers_script" "proxy" {
  account_id         = var.account_id
  script_name        = var.script_name
  main_module        = "worker.js"
  content_file       = "${path.module}/worker.js"
  content_sha256     = filesha256("${path.module}/worker.js")
  compatibility_date = "2026-10-01"

  bindings = [
    {
      name = "ALLOWED_ORIGINS"
      type = "json"
      json = jsonencode(var.allowed_origins)
    },
    # Per-IP limit, checked before the Worker fetches anything.
    {
      name         = "LIMITER"
      type         = "ratelimit"
      namespace_id = "1001"
      simple = {
        limit  = var.requests_per_minute
        period = 60
      }
    },
  ]

  # The Worker only pipes bytes, so a request needs next to no CPU. Capping it
  # bounds what a pathological request can cost on the paid plan (the free
  # plan has a fixed 10 ms and rejects this setting).
  limits = { cpu_ms = var.cpu_ms }
}

# Serve on <script_name>.<account subdomain>.workers.dev — unless a custom
# domain is set, which then becomes the only way in.
resource "cloudflare_workers_script_subdomain" "proxy" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.proxy.script_name
  enabled     = var.custom_domain == null
}

# Optional. Adds the edge cache (the Cache API is a no-op on workers.dev).
resource "cloudflare_workers_custom_domain" "proxy" {
  count = var.custom_domain == null ? 0 : 1

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = var.custom_domain
  service    = cloudflare_workers_script.proxy.script_name
}
