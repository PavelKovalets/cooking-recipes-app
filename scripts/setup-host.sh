#!/usr/bin/env bash
# Host setup for cooking-recipes-app local development (Ubuntu).
# Installs Docker Engine (system daemon) + mise (user-space version manager),
# then the pinned toolchain from mise.toml. Safe to re-run. See spec/local-dev.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 1/3  Docker Engine"
if command -v docker >/dev/null 2>&1; then
  echo "    already installed: $(docker --version)"
else
  sudo apt-get remove -y docker.io docker-doc docker-compose podman-docker containerd runc 2>/dev/null || true
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# allow running docker without sudo
if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER"
  echo "    added '$USER' to the 'docker' group — log out/in (or 'newgrp docker') to apply"
fi

echo "==> 2/3  mise"
if ! command -v mise >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/mise" ]; then
  curl -fsSL https://mise.run | sh
fi
MISE="$(command -v mise 2>/dev/null || echo "$HOME/.local/bin/mise")"
# activate mise in interactive bash shells (idempotent)
if ! grep -qF "mise activate bash" "$HOME/.bashrc" 2>/dev/null; then
  printf '\n# mise (https://mise.jdx.dev)\neval "$(%s/.local/bin/mise activate bash)"\n' "$HOME" >> "$HOME/.bashrc"
  echo "    added mise activation to ~/.bashrc"
fi

echo "==> 3/3  project toolchain (mise install)"
cd "$REPO_ROOT"
"$MISE" trust
"$MISE" install
"$MISE" ls

cat <<'EOF'

Done. Next:
  - Open a new shell (or: source ~/.bashrc) so mise + docker are on PATH.
  - If docker still needs sudo: log out/in (group change) or run 'newgrp docker'.
  - Verify: docker run hello-world && node -v && pnpm -v
EOF
