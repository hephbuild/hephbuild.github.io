variable "account_id" {
  description = "Cloudflare account ID that owns the Worker."
  type        = string
}

variable "workers_dev_subdomain" {
  description = "The account's workers.dev subdomain: the <name> in <name>.workers.dev (dashboard → Workers & Pages). Only used to print proxy_prefix."
  type        = string
  default     = null
}

variable "script_name" {
  description = "Worker name; also the first label of its workers.dev hostname."
  type        = string
  default     = "heph-playground-proxy"
}

variable "allowed_origins" {
  description = "Origins allowed to use the proxy; `*` matches one DNS label. Requests from any other origin are refused before anything is fetched."
  type        = list(string)
  default     = ["https://hephbuild.github.io", "https://hephbuild.pages.dev", "https://*.hephbuild.pages.dev", "http://localhost:3000"]
}

variable "requests_per_minute" {
  description = "Requests one IP may make per minute. A playground start makes one request per asset (about five)."
  type        = number
  default     = 30
}

variable "cpu_ms" {
  description = "Per-request CPU cap in milliseconds. Paid Workers plan only; leave null on the free plan."
  type        = number
  default     = null
}

variable "custom_domain" {
  description = "Optional hostname to serve the proxy on instead of workers.dev, e.g. heph-proxy.example.com. Enables the edge cache."
  type        = string
  default     = null
}

variable "zone_id" {
  description = "Zone ID of custom_domain. Required when custom_domain is set."
  type        = string
  default     = null

  validation {
    condition     = var.custom_domain == null || var.zone_id != null
    error_message = "zone_id is required when custom_domain is set."
  }
}
