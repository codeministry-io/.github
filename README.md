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
