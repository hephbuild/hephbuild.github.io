#!/bin/sh
# heph installer.
#
#   curl -fsSL https://hephbuild.github.io/install.sh | sh
#
# Environment overrides:
#   HEPH_BIN_NAME  installed binary name   (default: heph)
#   HEPH_BIN_DIR   install directory       (default: $HOME/.local/bin)
#   HEPH_VERSION   release tag to install  (default: the version pinned in
#                  .hephconfig / .hephconfig2, else latest)
#   HEPH_NO_MODIFY_PATH=1   skip writing to shell rc files

set -eu

REPO="hephbuild/heph-artifacts-v1"
BIN_NAME="${HEPH_BIN_NAME:-heph}"
BIN_DIR="${HEPH_BIN_DIR:-$HOME/.local/bin}"

# ---- output helpers ---------------------------------------------------------

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"
    RED="$(printf '\033[31m')"; GREEN="$(printf '\033[32m')"; RESET="$(printf '\033[0m')"
else
    BOLD=""; DIM=""; RED=""; GREEN=""; RESET=""
fi

info() { printf '%s\n' "$*"; }
note() { printf '%s%s%s\n' "$DIM" "$*" "$RESET"; }
err()  { printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# ---- version resolution -----------------------------------------------------
#
# Priority:
#   1. $HEPH_VERSION                       (explicit override)
#   2. version: pinned in .hephconfig / .hephconfig2
#   3. latest
#
# The config is searched for in the current directory and each parent, so the
# right toolchain is installed from anywhere inside a workspace.

CONFIG_FILE=""

find_config_version() {
    # On success sets VERSION + CONFIG_FILE from the first top-level `version:`
    # key found, walking up from $PWD. Returns non-zero if nothing is pinned.
    dir="$PWD"
    while :; do
        for name in .hephconfig .hephconfig2; do
            conf="$dir/$name"
            [ -f "$conf" ] || continue
            # First `version:` value, stripped of trailing comment, surrounding
            # quotes, and whitespace.
            v="$(sed -n 's/^[[:space:]]*version:[[:space:]]*//p' "$conf" \
                 | head -n1 \
                 | sed -e 's/[[:space:]]*#.*$//' \
                       -e 's/^["'\'']*//' \
                       -e 's/["'\'']*[[:space:]]*$//')"
            if [ -n "$v" ]; then
                VERSION="$v"
                CONFIG_FILE="$conf"
                return 0
            fi
        done
        parent="$(dirname "$dir")"
        [ "$parent" = "$dir" ] && break
        dir="$parent"
    done
    return 1
}

if [ -n "${HEPH_VERSION:-}" ]; then
    VERSION="$HEPH_VERSION"
elif find_config_version; then
    note "pinned version $VERSION (from $CONFIG_FILE)"
else
    VERSION="latest"
fi

# ---- platform detection -----------------------------------------------------

detect_os() {
    case "$(uname -s)" in
        Linux)  echo linux ;;
        Darwin) echo darwin ;;
        *)      err "unsupported OS: $(uname -s)" ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64 | amd64)  echo amd64 ;;
        aarch64 | arm64) echo arm64 ;;
        *)               err "unsupported architecture: $(uname -m)" ;;
    esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
ASSET="heph_${OS}_${ARCH}"

# Only these targets are published; fail early with a clear message otherwise.
case "$ASSET" in
    heph_linux_amd64 | heph_linux_arm64 | heph_darwin_arm64) ;;
    *) err "no prebuilt binary for ${OS}/${ARCH}" ;;
esac

# ---- downloader -------------------------------------------------------------

if command -v curl >/dev/null 2>&1; then
    dl() { curl -fSL --proto '=https' --tlsv1.2 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
    dl() { wget -qO "$2" "$1"; }
else
    err "need curl or wget to download heph"
fi

if [ "$VERSION" = "latest" ]; then
    URL="https://github.com/$REPO/releases/latest/download/$ASSET"
else
    URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
fi

# ---- install ----------------------------------------------------------------

info "${BOLD}Installing heph${RESET} (${OS}/${ARCH}, ${VERSION})"

TMP="$(mktemp "${TMPDIR:-/tmp}/heph.XXXXXX")"
trap 'rm -f "$TMP"' EXIT INT TERM

note "downloading $URL"
dl "$URL" "$TMP" || err "download failed: $URL"

[ -s "$TMP" ] || err "downloaded file is empty"

chmod +x "$TMP"
mkdir -p "$BIN_DIR"
mv -f "$TMP" "$BIN_DIR/$BIN_NAME"
trap - EXIT INT TERM

info "${GREEN}installed${RESET} $BIN_DIR/$BIN_NAME"

# ---- PATH setup -------------------------------------------------------------

on_path() {
    case ":$PATH:" in *":$BIN_DIR:"*) return 0 ;; *) return 1 ;; esac
}

add_to_rc() {
    rc="$1"
    line="export PATH=\"$BIN_DIR:\$PATH\""
    [ -f "$rc" ] || return 0
    if ! grep -qsF "$BIN_DIR" "$rc"; then
        printf '\n# added by heph installer\n%s\n' "$line" >> "$rc"
        note "updated $rc"
    fi
}

if on_path; then
    :
elif [ "${HEPH_NO_MODIFY_PATH:-0}" = "1" ]; then
    info "add ${BOLD}$BIN_DIR${RESET} to your PATH to use heph"
else
    # Touch the rc files for the common shells; only ones that exist get edited.
    add_to_rc "$HOME/.bashrc"
    add_to_rc "$HOME/.zshrc"
    add_to_rc "$HOME/.profile"
    [ -n "${ZDOTDIR:-}" ] && add_to_rc "$ZDOTDIR/.zshrc"

    cat <<EOF

heph is installed but not on your PATH for this shell.
Restart your terminal, or run:

    ${BOLD}export PATH="$BIN_DIR:\$PATH"${RESET}

EOF
fi

# ---- verify -----------------------------------------------------------------

if "$BIN_DIR/$BIN_NAME" version >/dev/null 2>&1; then
    info "$("$BIN_DIR/$BIN_NAME" version 2>/dev/null | head -n1)"
fi

info "${GREEN}done.${RESET} run ${BOLD}$BIN_NAME --help${RESET} to get started"
