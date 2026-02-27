# Big Feature Rollout Strategy + Kill Switch

Date: 2026-02-24
Status: Draft
Owners: Desktop Control Reliability (WP-10)

## Goals

- Roll out desktop control reliability + live vision safely with clear gates.
- Provide an immediate kill switch for high-severity regressions.
- Keep operator steps short and auditable.

## Feature Flags / Controls

Primary flags:
- `desktopControlPreflight`: gates readiness checks + desktop control enablement.
- `liveScreenSampling`: gates live vision/sampling workflows.

Defaults:
- Both flags default to `false` until rollout phases are entered.

## Rollout Phases

### Phase 1: Internal Dogfood

Audience: engineering + support.

Flags:
- Enable `desktopControlPreflight` for internal cohort.
- Enable `liveScreenSampling` only after 24 hours of stable preflight.

Entry gate:
- Typecheck passes for desktop package.
- Support runbook reviewed.

Promotion gate:
- 2 business days with zero P0/P1 incidents.
- Manual verification on at least 3 macOS machines.

### Phase 2: Beta

Audience: opted-in beta users.

Flags:
- `desktopControlPreflight` enabled for beta cohort.
- `liveScreenSampling` starts at 10% beta canary, then 50% after 3 stable days.

Promotion gate:
- 7 consecutive days with no Sev-1 incidents.
- Support ticket rate <3% of beta WAU for desktop-control issues.

### Phase 3: GA

Audience: all users.

Flags:
- 25% -> 50% -> 100% cohort increases over 3 release windows.
- `liveScreenSampling` only after 50% GA stability check.

Steady-state gate:
- Reliability KPIs meet baseline from `docs/plans/big-feature-acceptance.md`.

## Kill Switch Behavior

Immediate rollback triggers:
- P0/P1 crash, data-loss, or security incident linked to desktop control.
- 2x baseline failure rate for desktop-control actions sustained for 24 hours.
- Reproducible CPU regression tied to live sampling.

Kill switch actions (order):
1. Disable `liveScreenSampling` for affected cohort.
2. If impact persists, disable `desktopControlPreflight` for cohort.
3. If still failing, disable both flags globally and ship hotfix if required.

## Operational Checklist

- Confirm flags exist in `apps/desktop/src/main/store/appSettings.ts`.
- Announce phase start with enabled flags + cohort size + rollback owner.
- Monitor first 2 hours after each cohort increase for crash, permission, and latency regressions.
- If trigger hits, execute kill switch within 15 minutes and post incident update.

## Ownership + Escalation

- Support: first-response triage, confirms trigger conditions.
- Engineering on-call: executes kill switch and hotfix decisions.
- Product owner: approves phase promotions.
