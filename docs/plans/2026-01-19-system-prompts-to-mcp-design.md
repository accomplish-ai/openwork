# Design: Migrate System Prompts to MCP + Skills Pattern

**Date:** 2026-01-19
**Branch:** `refactor/system-prompts-to-mcp-and-skils`
**Status:** Approved

## Problem

The current system prompt in `config-generator.ts` is 268 lines, containing:
- Identity and behavior (keep)
- Tool documentation (redundant with MCP)
- Skill instructions (should be in skills)
- Workflow rules (should be in MCP tool descriptions)

This causes:
1. Duplication between system prompt and SKILL.md files
2. MCP tools have minimal descriptions, missing critical behavioral rules
3. Large context window usage for every request

## Solution

**Approach A: Minimal System Prompt** - Move tool/skill documentation into MCP servers, keep only identity and behavior in system prompt.

### MCP Best Practice (from modelcontextprotocol.io)

> "Before MCP, developers often crafted a monolithic prompt containing instructions, examples, and appended data. These approaches work, but they are ad hoc and lack standardization. MCP introduces structured context management."

MCP tool `description` fields can contain rich text with examples and rules. The model sees these when discovering tools.

## Current State

### System Prompt Sections (268 lines)

| Section | Lines | Purpose |
|---------|-------|---------|
| `<identity>` | 3 | Who the agent is |
| `<environment>` | 8 | Node.js bundling (only for dev-browser) |
| `<capabilities>` | 5 | What to tell users |
| `<important name="filesystem-rules">` | 27 | File permission workflow |
| `<tool name="request_file_permission">` | 31 | Tool documentation |
| `<skill name="dev-browser">` | 169 | Browser automation |
| `<important name="user-communication">` | 4 | AskUserQuestion reminder |
| `<behavior>` | 11 | Output guidelines |

### Existing MCP Servers

1. **file-permission** - `request_file_permission` tool (minimal description)
2. **ask-user-question** - `AskUserQuestion` tool (minimal description)
3. **dev-browser** - HTTP server (handled in separate PR)

## Target State

### New System Prompt (~25 lines)

```typescript
const ACCOMPLISH_SYSTEM_PROMPT = `<identity>
You are Accomplish, a browser automation assistant.
</identity>

<capabilities>
When users ask about your capabilities, mention:
- **Browser Automation**: Control web browsers, navigate sites, fill forms, click buttons
- **File Management**: Sort, rename, and move files based on content or rules
</capabilities>

<behavior>
- Write small, focused scripts - each does ONE thing
- After each script, evaluate the output before deciding next steps
- Be concise - don't narrate every internal action
- Hide implementation details - describe actions in user terms
- Only speak when you have meaningful results or need input
</behavior>
`;
```

### Enhanced MCP Tool Descriptions

#### file-permission

```typescript
{
  name: 'request_file_permission',
  description: `Request user permission before performing file operations.

CRITICAL WORKFLOW - NEVER SKIP:
Before using Write, Edit, Bash (with file ops), or ANY tool that touches files:
1. FIRST: Call this tool and wait for response
2. ONLY IF "allowed": Proceed with the file operation
3. IF "denied": Stop and inform the user

WRONG:
  Write({ path: "/tmp/file.txt" })  ← Permission not requested!

CORRECT:
  request_file_permission({ operation: "create", filePath: "/tmp/file.txt" })
  → Wait for "allowed"
  Write({ path: "/tmp/file.txt" })  ← OK after permission granted

APPLIES TO:
- Creating files (Write tool, bash echo/cat, scripts that output files)
- Renaming files (bash mv, rename commands)
- Deleting files (bash rm, delete commands)
- Modifying files (Edit tool, bash sed/awk)

EXCEPTION: Temp scripts matching /tmp/accomplish-*.mts are auto-allowed.

Returns: "allowed" or "denied"`,
  inputSchema: { /* existing */ }
}
```

#### ask-user-question

```typescript
{
  name: 'AskUserQuestion',
  description: `Ask the user a question via UI modal.

CRITICAL: The user CANNOT see your text output or CLI prompts!
If you write "Let me ask you..." - THE USER WILL NOT SEE IT.
You MUST call this tool to communicate with the user.

WHEN TO USE:
- Clarifying questions before ambiguous tasks
- Confirming destructive/irreversible actions
- Getting user preferences or approval

CUSTOM TEXT INPUT:
Include { label: "Other", description: "Type your own" } to allow free text.
Response will be "User responded: [text]" instead of "User selected: Other".

RESPONSE FORMAT:
- "User selected: Option A"
- "User selected: Option A, Option B" (if multiSelect)
- "User responded: [custom text]"
- "User declined to answer the question."`,
  inputSchema: { /* existing */ }
}
```

## Migration Mapping

| Current Location | Content | Destination |
|-----------------|---------|-------------|
| System prompt `<identity>` | Agent identity | **Keep** in system prompt |
| System prompt `<environment>` | NODE_BIN_PATH usage | **Remove** (dev-browser handles internally) |
| System prompt `<capabilities>` | User-facing capabilities | **Keep** in system prompt |
| System prompt `<filesystem-rules>` | Permission workflow | **Move** to file-permission MCP description |
| System prompt `<tool>` | Tool params | **Remove** (MCP inputSchema covers this) |
| System prompt `<skill dev-browser>` | Browser automation | **Remove** (separate PR) |
| System prompt `<user-communication>` | CLI invisibility rule | **Move** to ask-user-question MCP description |
| System prompt `<behavior>` | Output guidelines | **Keep** in system prompt |
| `ask-user-question/SKILL.md` | Tool usage guide | **Remove** (content in MCP description) |

## Implementation Plan

### Phase 1: Enhance MCP Tool Descriptions

1. **file-permission MCP** (`skills/file-permission/src/index.ts`)
   - Expand `description` with workflow rules, examples, exception

2. **ask-user-question MCP** (`skills/ask-user-question/src/index.ts`)
   - Expand `description` with CLI invisibility rule, response formats

### Phase 2: Minimize System Prompt

3. **config-generator.ts**
   - Remove `<environment>` (8 lines)
   - Remove `<filesystem-rules>` (27 lines)
   - Remove `<tool>` (31 lines)
   - Remove `<skill dev-browser>` (169 lines)
   - Remove `<user-communication>` (4 lines)
   - Result: ~25 lines

### Phase 3: Cleanup

4. **Remove `skills/ask-user-question/SKILL.md`**
   - Content now lives in MCP tool description

5. **Update tests** (`config-generator.integration.test.ts`)
   - Adjust assertions for new prompt structure

## Files Changed

| File | Change |
|------|--------|
| `apps/desktop/src/main/opencode/config-generator.ts` | Reduce prompt from 268 to ~25 lines |
| `apps/desktop/skills/file-permission/src/index.ts` | Expand tool description |
| `apps/desktop/skills/ask-user-question/src/index.ts` | Expand tool description |
| `apps/desktop/skills/ask-user-question/SKILL.md` | Delete |
| `apps/desktop/__tests__/.../config-generator.integration.test.ts` | Update assertions |

## Benefits

1. **Reduced context usage** - 268 lines → 25 lines in system prompt
2. **Single source of truth** - Tool rules live with the tool
3. **MCP-native** - Follows structured context management pattern
4. **Maintainability** - Update tool behavior in one place

## References

- [MCP Prompts Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)
- [MCP Features Guide - WorkOS](https://workos.com/blog/mcp-features-guide)
- [MCP Impact 2025 - Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/model-context-protocol-mcp-impact-2025)
