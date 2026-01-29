# File Uploads Feature Design

**Date:** 2026-01-29
**Status:** Approved
**Branch:** feat/add-file-uploads

## Overview

Add the ability to attach files to tasks via the + button menu. Files are passed as paths to the AI agent, which can read them directly via filesystem access. This enables users to reference documents, images, code files, and data for context.

## User Flow

1. User clicks + button → selects "Attach Files" → native file picker opens
2. Alternatively, user drags files onto the input area
3. Selected files appear as compact chips above the textarea
4. User types their prompt and submits
5. File paths are prepended to the prompt for the AI
6. User message in history shows the attached file chips

## UI Design

### File Attachment Input

```
┌─────────────────────────────────────────────────────┐
│ [📄 requirements.pdf ✕] [🖼 screenshot.png ✕]       │  ← File chips row
│                                                     │
│ [+]  Analyze these files and...              [🎤][→]│  ← Input row
└─────────────────────────────────────────────────────┘
```

### Plus Menu Addition

```
┌─────────────────┐
│ 📎 Attach Files │  ← New option (top of menu)
├─────────────────┤
│ ⚡ Use Skills   │  → (existing submenu)
└─────────────────┘
```

### File Chip Component

- Colored icon based on file type (red=PDF, blue=image, green=CSV, amber=code)
- Truncated filename (max 140px width)
- X button to remove
- Smooth enter/exit animations (scale + fade)

### Drag & Drop

- Drop zone: entire input wrapper
- Visual feedback: dashed border, subtle background tint
- Only accepts files (folders ignored)

## Data Structures

### AttachedFile Type

```typescript
interface AttachedFile {
  id: string;          // Unique ID for React keys
  path: string;        // Absolute file path
  name: string;        // Display name (basename)
  type: 'pdf' | 'image' | 'csv' | 'code' | 'text' | 'other';
  size?: number;       // Optional, for display
}
```

### FileAttachment Type (for storage)

```typescript
// Add to packages/shared/src/types/task.ts
interface FileAttachment {
  type: 'pdf' | 'image' | 'csv' | 'code' | 'text' | 'other';
  path: string;
  name: string;
}
```

### Extended TaskMessage

```typescript
interface TaskMessage {
  // ... existing fields
  attachments?: (TaskAttachment | FileAttachment)[];
}
```

## Prompt Construction

When submitting with attached files, prepend paths to the prompt:

```
[Attached files]
- /Users/dan/docs/requirements.pdf
- /Users/dan/screenshots/mockup.png

User's actual prompt text here...
```

The AI agent uses its `Read` tool to access file contents.

## Components

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `FileChip.tsx` | `renderer/components/ui/` | Single file chip with icon, name, remove |
| `FileChipsRow.tsx` | `renderer/components/ui/` | Container for multiple chips |

### Modified Components

| Component | Changes |
|-----------|---------|
| `PlusMenu/index.tsx` | Add "Attach Files" menu item |
| `TaskInputBar.tsx` | Add attachedFiles state, FileChipsRow, drag & drop |
| `Execution.tsx` | Same for follow-up input |
| `MessageBubble` | Render FileChipsRow for messages with attachments |
| `taskStore.ts` | Handle file attachments in startTask/sendFollowUp |

### Shared Types

| File | Changes |
|------|---------|
| `packages/shared/src/types/task.ts` | Add FileAttachment type, extend TaskMessage |

## Validation & Limits

- **Max files:** 10 per message
- **File size:** No limit (paths only, not uploading)
- **Duplicates:** Prevent adding same path twice
- **Folders:** Ignored, only files accepted
- **Missing files:** Show error toast, don't add chip

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| File deleted after attach | AI's Read tool fails gracefully |
| Very long path | Truncate display, full path in tooltip |
| Clear input text | Keep attached files |
| Submit message | Clear attached files |

## Accessibility

- Chips keyboard navigable (Tab focus, Delete to remove)
- Screen reader: "Attached file: [name], press delete to remove"
- Drop zone: `aria-label="Drop files here to attach"`

## File Type Detection

Map file extensions to types:

```typescript
const FILE_TYPE_MAP: Record<string, AttachedFile['type']> = {
  // Documents
  pdf: 'pdf',
  doc: 'text', docx: 'text',
  txt: 'text', md: 'text', rtf: 'text',

  // Images
  png: 'image', jpg: 'image', jpeg: 'image',
  gif: 'image', webp: 'image', svg: 'image',

  // Data
  csv: 'csv', xlsx: 'csv', xls: 'csv', json: 'csv',

  // Code
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code',
  html: 'code', css: 'code', sql: 'code',
};
```

## Out of Scope

- File content preview in chips (just show name)
- Image thumbnails
- Paste from clipboard
- Cloud file picker integrations
- File upload to server (local paths only)
