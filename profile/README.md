# codeministry.io

**Web development, hosting and operations for small businesses, from Bedburg near Cologne.**
We build websites and web apps, run them on our own Kubernetes cluster and keep them running: one contact person,
no ticket system, no call center.

## Open source

| Project | What it is | Status |
|---|---|---|
| [**spectant**](https://github.com/codeministry-io/spectant) | The local spec companion for developers: one dashboard for the Markdown specs in all your repositories, with a Spec skill for Claude Code. Nothing leaves your machine. ([spectant.pro](https://spectant.pro)) | pre-release |
| [**leadgen**](https://github.com/codeministry-io/leadgen) | Acquisition tool for freelancers: collects project offers, filters them deterministically against your profile, scores what survives and assembles the application. | alpha |
| [**.github**](https://github.com/codeministry-io/.github) | Reusable GitHub Actions workflows: Trivy image scan and deploy screenshots to Slack. | in use |

We also maintain forks we run in production and send fixes upstream:
[erpnext_germanized](https://github.com/codeministry-io/erpnext_germanized) (ERPNext for German companies, by
[encircle360-oss](https://github.com/encircle360-oss)),
[straightmail](https://github.com/codeministry-io/straightmail) (mail microservice with templating) and
[renovate-operator](https://github.com/codeministry-io/renovate-operator) (Renovate in Kubernetes, by
[mogenius](https://github.com/mogenius)).

## How we work

- **GitOps all the way:** k3s on ARM64, Argo CD, Helm, Traefik and cert-manager. What runs is what is in git.
- **Always on the latest stable version:** Renovate watches every image and chart, patches merge themselves once
  checks are green, majors are reviewed by a human.
- **Security as a routine:** Trivy in CI and in the cluster, vendor advisory feeds, CVE alerts within hours.
- **Spec-driven:** every feature starts as a spec with verifiable claims, built with AI-assisted coding and
  reviewed by a human.

## Contact

[codeministry.io](https://codeministry.io) · [contact@codeministry.io](mailto:contact@codeministry.io) ·
[LinkedIn](https://www.linkedin.com/in/marcello-muscara)
