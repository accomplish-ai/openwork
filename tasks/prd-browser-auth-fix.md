# PRD: Browser Authentication Fix

## Introduction

The current browser automation implementation is being blocked by major platforms (Google, Microsoft, etc.) with "This browser or app may not be secure" errors. This prevents users from authenticating with these services during task execution. The fix will improve user agent headers and browser fingerprinting to make the automated browser appear as a trusted browser.

## Goals

- Enable successful authentication to Google services (Calendar, Docs, Drive, etc.)
- Enable successful authentication to Microsoft services (Office 365, Outlook, etc.)
- Provide user-friendly authentication experience across platforms
- Maintain existing functionality while improving compatibility

## User Stories

### US-001: Implement realistic user agent headers
**Description:** As a user, I want the automated browser to use modern, realistic user agent strings so that platforms recognize it as a trusted browser.

**Acceptance Criteria:**
- [ ] User agent strings updated to current Chrome/Firefox/Safari versions
- [ ] User agent varies based on OS platform (macOS, Windows, Linux)
- [ ] All platform-specific headers included (Accept-Language, Sec-*, etc.)
- [ ] Typecheck passes
- [ ] Verify with Google login using dev-browser skill

### US-002: Implement browser fingerprint mitigation
**Description:** As a user, I want the browser automation to handle additional platform detection (WebGL, Canvas, etc.) so that automated browsers aren't flagged as suspicious.

**Acceptance Criteria:**
- [ ] Browser fingerprint matches standard Chrome/Firefox patterns
- [ ] WebDriver flag properly hidden
- [ ] Chrome DevTools Protocol automation flags masked
- [ ] Typecheck passes
- [ ] Verify with Google login using dev-browser skill

### US-003: Add auth session persistence
**Description:** As a user, I want authentication sessions to persist so I don't need to re-authenticate on every task.

**Acceptance Criteria:**
- [ ] Cookies and session storage persisted between browser launches
- [ ] User sessions maintained for reasonable time period
- [ ] Clear option provided to clear stored auth sessions
- [ ] Typecheck passes
- [ ] Verify session persists across tasks using dev-browser skill

### US-004: Add auth error handling guidance
**Description:** As a user, I want helpful error messages when auth fails so I know how to resolve the issue.

**Acceptance Criteria:**
- [ ] Clear error messages when auth is blocked
- [ ] Instructions provided when platform requires manual intervention
- [ ] Retry mechanism with updated headers
- [ ] Typecheck passes
- [ ] Verify error messages display using dev-browser skill

## Functional Requirements

- FR-1: Use current stable browser user agent strings (Chrome 120+, Firefox 120+, Safari 17+)
- FR-2: Include complete set of browser headers (Accept, Accept-Language, Sec-Ch-Ua, etc.)
- FR-3: Mask automation flags (navigator.webdriver, automation flags in headers)
- FR-4: Support platform-specific user agents (macOS, Windows, Linux)
- FR-5: Persist authentication cookies across browser sessions
- FR-6: Provide clear error messaging when authentication is blocked
- FR-7: Implement retry logic with updated browser fingerprint on failure

## Non-Goals

- No full OAuth implementation (browser-based auth is acceptable)
- No proxy/VPN services
- No CAPTCHA solving
- No support for older browser versions (<2023)

## Design Considerations

- Use Puppeteer/Playwright stealth plugins if available
- Consider headful mode for initial auth (users can see what's happening)
- Provide option for users to manually complete auth if automated fails
- Store auth data securely (electron-store with encryption)

## Technical Considerations

- Current browser automation uses Playwright (verify from codebase)
- User agent updates should be maintainable (version in config, not hardcoded)
- Consider headless vs headful mode implications
- Session persistence location: `src/main/store/` similar to existing stores
- Error handling must use `normalizeIpcError` for consistency

## Success Metrics

- Google login success rate >90%
- Microsoft login success rate >90%
- Average time to complete auth <30 seconds
- Users report <5% auth-related support tickets

## Open Questions

- Should we offer headful mode as a fallback for auth issues?
- What session timeout is appropriate? (1 hour, 24 hours, 1 week?)
- Should we auto-detect platform user agent or let user choose?
