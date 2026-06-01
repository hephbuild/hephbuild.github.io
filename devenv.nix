{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    # Node 24 (current LTS). Node 26 is not released yet (~Oct 2026).
    package = pkgs.nodejs_24;
    npm.enable = true;
  };

  # Scripts mirrored by CI (see .github/workflows/deploy.yml) so local and CI
  # runs are identical — everything happens inside `devenv shell`.
  scripts.install.exec = "npm ci";
  scripts.lint.exec = "npm run lint";
  scripts.build.exec = "npm run build";
  scripts.dev.exec = "npm run start";
}
