---
"@accomplish/shared": minor
"@accomplish/core": minor
---

Enable npm publishing for @accomplish/core and @accomplish/shared packages

- Remove private flag from both packages
- Add publishing metadata (description, license, repository, publishConfig)
- Setup Changesets for version management and changelog generation
- Add GitHub Actions workflow for automated npm releases
- Add CI guardrails to require changesets when packages are modified
