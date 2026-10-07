# Source me: `source env.sh`, with CLOUDFLARE_API_TOKEN set (or saved in
# ~/.cloudflare-heph-token).
#
# The state backend speaks R2's S3 API, whose credentials derive from the same
# Cloudflare API token: the access key is the token's id, the secret the
# SHA-256 of its value. The token needs Workers Scripts: Edit and
# Workers R2 Storage: Edit on the account.

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -r "$HOME/.cloudflare-heph-token" ]; then
  CLOUDFLARE_API_TOKEN=$(cat "$HOME/.cloudflare-heph-token")
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "env.sh: set CLOUDFLARE_API_TOKEN first" >&2
  return 1 2>/dev/null || exit 1
fi
export CLOUDFLARE_API_TOKEN

AWS_ACCESS_KEY_ID=$(
  curl -fsS https://api.cloudflare.com/client/v4/accounts/b9d7099532d2613531d6f54b60211d0c/tokens/verify \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" |
    sed -n 's/.*"id" *: *"\([0-9a-f]\{32\}\)".*/\1/p'
)
AWS_SECRET_ACCESS_KEY=$(printf %s "$CLOUDFLARE_API_TOKEN" | shasum -a 256 | cut -d' ' -f1)
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

if [ -z "$AWS_ACCESS_KEY_ID" ]; then
  echo "env.sh: could not resolve the token id (is the token valid for this account?)" >&2
  return 1 2>/dev/null || exit 1
fi
