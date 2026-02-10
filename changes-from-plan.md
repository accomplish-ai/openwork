# Changes From Plan
> Auto-tracked by team-execute. Every code change not in the original plan is logged here.

| # | Date | Agent | File(s) | What Changed | Why | Plan Reference |
|---|------|-------|---------|-------------|-----|----------------|
| 1 | 2026-02-10 | infra-coder | infra/package.json | Added `typescript` as devDependency | `npx tsc --noEmit` failed without it — plan assumed it was already installed | Task 11 |
| 2 | 2026-02-10 | infra-coder | infra/deploy.sh | Subcommand interface (`upload`/`deploy-workers`) instead of source+function approach | Bug fix #5: sourcing is fragile in CI; subcommands are cleaner | Task 5/8 |
| 3 | 2026-02-10 | infra-coder | infra/deploy.sh | `get_version()` uses `fs.readFileSync` instead of `require()` | Bug fix #2: `type: "module"` in package.json breaks `require()` | Task 5 |
| 4 | 2026-02-10 | infra-coder | infra/preview-cleanup.sh | Used `node -e` to parse JSON instead of `grep -oP` | Bug fix #3: `grep -oP` not available on macOS | Task 7 |
| 5 | 2026-02-10 | infra-coder | infra/deploy.sh, scripts | Cloudflare subdomain set to `accomplish` in echo URLs | Bug fix #4: subdomain is `accomplish` | Task 5 |
| 6 | 2026-02-10 | infra-coder | .github/workflows/deploy.yml | Uses `bash deploy.sh upload lite` subcommand instead of `source deploy.sh && upload_to_r2` | Bug fix #5: cleaner CI integration | Task 8 |
