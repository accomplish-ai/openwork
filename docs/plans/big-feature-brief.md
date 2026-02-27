# Big Feature Brief: Desktop Control Reliability + Live Vision

## Problem
Openwork's desktop control capabilities are inconsistent on macOS. Users report that screenshots fail intermittently, live context is missing (only single snapshots), and mouse/keyboard actions are unreliable. When these tools fail, the assistant falls back to generic responses, breaking trust and causing task abandonment.

## Target Users
- Power users who rely on Openwork for hands-on desktop workflows (file cleanup, UI-driven tasks, app setup).
- New users evaluating whether Openwork can reliably act (screenshot + actions) during onboarding.
- Support and QA teams who need clear diagnostics when automation fails.

## Success Metrics
- >= 95% success rate for screenshot captures in routine macOS sessions.
- >= 90% success rate for action-executor steps in a standard task flow.
- Live vision sampling sessions complete with a usable frame within 2 seconds in 95% of attempts.
- Reduction in user-reported "tool failure" incidents by 50% within 4 weeks of rollout.
- Decrease in generic fallback responses during tool failures by 80% (measured via telemetry).
