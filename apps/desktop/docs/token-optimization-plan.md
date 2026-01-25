# Token Optimization Plan for dev-browser-mcp

## Problem Statement

Browser accessibility tree snapshots on complex pages (e.g., Zillow) can contain 5,000+ elements, causing:
- Single snapshots of 50K+ tokens
- Session accumulation to 300K+ tokens
- Tasks failing with "prompt is too long" errors

---

## Phase 1: Quick Wins (Low Risk, High Impact)

### 1.1 Add `maxElements` Parameter
- Limit snapshot to first N interactive elements (default: 1000)
- Prioritize elements by: buttons > links > inputs > other
- Add warning when truncated: `"[Truncated: showing 1000 of 5538 elements]"`

### 1.2 Add `maxDepth` Parameter
- Limit tree nesting depth (default: 5 levels)
- Collapse deeper nodes into `"... [N nested elements]"`

### 1.3 Improve `interactiveOnly` Mode
- Currently captures all interactive elements
- Add smarter filtering: skip duplicate nav/footer across snapshots
- Cache "seen patterns" per session

---

## Phase 2: Viewport-Based Optimization (Medium Effort)

### 2.1 Add `viewportOnly` Mode
- Only capture elements visible in current viewport
- Use Playwright's `isVisible()` check with bounding box

### 2.2 Add `viewportExpansion` Parameter
- Expand capture area by N pixels beyond viewport (default: 500)
- Catches elements just below fold

### 2.3 Scroll-Aware Snapshots
- After scroll actions, only return NEW elements
- Diff against previous viewport, not whole page

---

## Phase 3: Token Budget System (Higher Effort, Best Results)

### 3.1 Add `maxTokens` Parameter
- Estimate tokens per element (~10-50 tokens each)
- Stop adding elements when budget reached (default: 8000)

### 3.2 Adaptive Downsampling (D2Snap-style)
- If over budget: merge generic containers (div → parent)
- If still over: reduce text content with summarization
- If still over: drop lowest-priority elements

### 3.3 Token Estimation Function
```typescript
function estimateTokens(element: SnapshotElement): number {
  // ~4 chars per token
  return Math.ceil((element.role.length + element.name.length + 20) / 4);
}
```

---

## Phase 4: Context Management (Architectural)

### 4.1 Snapshot Rotation
- Keep only last 3 snapshots in context
- Replace oldest when adding new
- Reduces accumulation over long sessions

### 4.2 Progressive Disclosure
- First snapshot: high-level structure only (headings, main regions)
- Agent can request "expand [ref]" for details
- Similar to Verdex approach

### 4.3 Semantic Deduplication
- Hash navigation/footer patterns
- Skip if identical to previous page
- Only show once per session with note: `"[Navigation same as before, refs e1-e50 unchanged]"`

---

## Implementation Priority

| Priority | Item | Effort | Impact | Risk |
|----------|------|--------|--------|------|
| 🔴 P0 | maxElements (1000) | 2 hours | High | Low |
| 🔴 P0 | maxDepth (5) | 2 hours | Medium | Low |
| 🟡 P1 | viewportOnly mode | 4 hours | High | Medium |
| 🟡 P1 | Snapshot rotation (keep 3) | 4 hours | High | Low |
| 🟢 P2 | maxTokens budget | 1 day | High | Medium |
| 🟢 P2 | Nav/footer deduplication | 1 day | Medium | Low |
| 🔵 P3 | Adaptive downsampling | 2-3 days | High | Medium |
| 🔵 P3 | Progressive disclosure | 3-5 days | High | High |

---

## Suggested Rollout

### Week 1: P0 Items (maxElements, maxDepth)
- Safe defaults, low risk
- Immediate relief for worst cases

### Week 2: P1 Items (viewportOnly, snapshot rotation)
- Bigger impact on token accumulation
- Test thoroughly with real tasks

### Week 3: P2 Items (token budget, deduplication)
- More sophisticated optimization
- May need tuning based on agent feedback

### Future: P3 Items (adaptive downsampling, progressive disclosure)
- Architectural changes
- Best long-term solution

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Max elements per snapshot | 5,538 | < 1,000 |
| Tokens per snapshot | ~50K | < 10K |
| Session token accumulation | 300K+ | < 150K |
| Task completion rate | ~80% | > 95% |
| Tasks hitting token limit | Common | Rare |

---

## Industry References

- **agent-browser** (Vercel): 93% context reduction with "Snapshot + Refs" approach
  - https://paddo.dev/blog/agent-browser-context-efficiency/

- **browser-use**: `max_input_tokens`, `viewport_expansion`, `paint_order_filtering`
  - https://docs.browser-use.com/customize/agent/all-parameters

- **D2Snap/Webfuse**: Adaptive downsampling with token budget targeting
  - https://www.webfuse.com/blog/dom-downsampling-for-llm-based-web-agents

- **Playwright MCP**: YAML serialization optimized for LLMs
  - https://www.zstack-cloud.com/blog/playwright-mcp-deep-dive-the-perfect-combination-of-large-language-models-and-browser-automation/
