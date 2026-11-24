# codeministry/.github

Shared GitHub Actions workflows for the codeministry repositories.

## `trivy-image.yml`

Reusable Trivy scan of one published container image: HIGH and CRITICAL with an available fix, Java archives
included. New findings since the previous run go to Slack once; the job summary lists all of them; a scheduled run
with findings fails. Not meant as a required check.

```yaml
jobs:
  trivy:
    permissions:
      contents: read
      packages: read
      security-events: write
    uses: codeministry/.github/.github/workflows/trivy-image.yml@main
    with:
      image: ghcr.io/codeministry/<image>:latest
    secrets:
      SECURITY_WEBHOOK: ${{ secrets.SECURITY_WEBHOOK }}
```

Public on purpose: a reusable workflow in a private repository cannot be called from a public one.

## `deploy-screenshots.yml`

Screenshots of a freshly deployed app in Slack #notifications, desktop (1440) and mobile (390, touch), one message per
build with repo, commit and build link. Runs after the image build on main, waits until the start page names new
bundles (at most `wait-minutes`), records with Playwright and Chromium on the runner and uploads through a Slack bot.
No screenshot service; the images also stay seven days as a run artifact. Never a required check.

```yaml
# .github/workflows/screenshots.yml in an app repo
name: Deploy screenshots

on:
  workflow_run:
    workflows: ["<name of the image build workflow>"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      wait-minutes:
        description: Wait for new bundles at most this long
        type: number
        default: 1

permissions:
  contents: read

jobs:
  screenshots:
    if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event != 'pull_request')
    uses: codeministry/.github/.github/workflows/deploy-screenshots.yml@main
    with:
      pages: |
        https://www.example.de/
      consent-button: Nur notwendige
      wait-minutes: ${{ github.event_name == 'workflow_dispatch' && inputs.wait-minutes || 15 }}
    secrets:
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_SCREENSHOTS_TOKEN }}
```

**Slack app, once:** api.slack.com/apps → *Create New App* → *From an app manifest* →
`slack/deploy-screenshots-app.yaml`; install it, `/invite @Deploy-Screenshots` in #notifications, then per caller repo
`gh secret set SLACK_SCREENSHOTS_TOKEN -R codeministry/<repo>` with the Bot User OAuth Token. Scopes are `files:write`
and `chat:write` only.

**Rotating the token:** *OAuth & Permissions* → *Revoke tokens*, reinstall the app, set the new token in every caller
repo. Callers without a valid token fail with `invalid_auth` in the log until then; nothing else is affected.

**Rollback.** Stage 1, about a minute: `gh workflow disable screenshots.yml -R codeministry/<repo>` in every caller.
Stage 2, about ten minutes: remove `screenshots.yml` and the secret in every caller, remove this workflow, the script
under `scripts/deploy-screenshots/` and the manifest here, and delete the Slack app (which revokes the token). The run
keeps no state; posted messages stay in the channel.
