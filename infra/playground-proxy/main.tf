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

  # State lives in the R2 bucket heph-tf-state, through R2's S3-compatible API.
  # Credentials come from the environment: `source env.sh`.
  backend "s3" {
    bucket       = "heph-tf-state"
    key          = "playground-proxy/terraform.tfstate"
    region       = "auto"
    endpoints    = { s3 = "https://b9d7099532d2613531d6f54b60211d0c.r2.cloudflarestorage.com" }
    use_lockfile = true

    # R2 is not AWS: skip the AWS-only checks.
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
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
