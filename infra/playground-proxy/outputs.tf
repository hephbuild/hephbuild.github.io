output "proxy_prefix" {
  description = "Value for PLAYGROUND_PROXY in website/src/constants.ts."
  value = format("https://%s/heph-release?", (
    var.custom_domain != null ? var.custom_domain :
    "${var.script_name}.${coalesce(var.workers_dev_subdomain, "<workers_dev_subdomain>")}.workers.dev"
  ))
}
