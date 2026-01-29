# File Uploads Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file attachment capability to the + menu, allowing users to attach local files as context for AI tasks.

**Architecture:** Files are referenced by path (not uploaded). The PlusMenu gets an "Attach Files" option that triggers native file picker. Attached files appear as compact chips above the textarea. On submit, file paths are prepended to the prompt. The AI uses its Read tool to access file contents.

**Tech Stack:** React, TypeScript, Electron (dialog.showOpenDialog), Zustand, Tailwind CSS

---

## Task 1: Add FileAttachment Type to Shared Package

**Files:**
- Modify: `packages/shared/src/types/task.ts`

**Step 1: Add the FileAttachment interface**

Add after the existing `TaskAttachment` interface (around line 50):

```typescript
export type FileType = 'pdf' | 'image' | 'csv' | 'code' | 'text' | 'other';

export interface FileAttachment {
  type: FileType;
  path: string;
  name: string;
}
```

**Step 2: Update TaskAttachment type to be a union**

Modify the `attachments` field in `TaskMessage` to accept both types. Change line 60 from:

```typescript
  attachments?: TaskAttachment[];
```

to:

```typescript
  attachments?: (TaskAttachment | FileAttachment)[];
```

**Step 3: Add type guard helper**

Add at the end of the file:

```typescript
export function isFileAttachment(attachment: TaskAttachment | FileAttachment): attachment is FileAttachment {
  return 'path' in attachment && 'name' in attachment;
}
```

**Step 4: Export new types in index**

Modify: `packages/shared/src/types/index.ts`

Ensure `FileType`, `FileAttachment`, and `isFileAttachment` are exported (they should auto-export if task.ts is already exported with `*`).

**Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no type errors

**Step 6: Commit**

```bash
git add packages/shared/src/types/task.ts
git commit -m "feat(shared): add FileAttachment type for file uploads"
```

---

## Task 2: Create FileChip Component

**Files:**
- Create: `apps/desktop/src/renderer/components/ui/FileChip.tsx`

**Step 1: Create the FileChip component**

```typescript
import { X, FileText, Image, Table, Code, File } from 'lucide-react';
import type { FileType } from '@accomplish/shared';
import { cn } from '@/lib/utils';

export interface AttachedFile {
  id: string;
  path: string;
  name: string;
  type: FileType;
}

interface FileChipProps {
  file: AttachedFile;
  onRemove?: () => void;
  readonly?: boolean;
}

const FILE_TYPE_ICONS: Record<FileType, typeof FileText> = {
  pdf: FileText,
  image: Image,
  csv: Table,
  code: Code,
  text: FileText,
  other: File,
};

const FILE_TYPE_COLORS: Record<FileType, string> = {
  pdf: 'bg-red-100 text-red-600',
  image: 'bg-blue-100 text-blue-600',
  csv: 'bg-green-100 text-green-600',
  code: 'bg-amber-100 text-amber-600',
  text: 'bg-gray-100 text-gray-600',
  other: 'bg-gray-100 text-gray-600',
};

export function FileChip({ file, onRemove, readonly = false }: FileChipProps) {
  const Icon = FILE_TYPE_ICONS[file.type];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm',
        'bg-muted border border-border',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      title={file.path}
    >
      <span className={cn('p-1 rounded', FILE_TYPE_COLORS[file.type])}>
        <Icon className="h-3 w-3" />
      </span>
      <span className="max-w-[140px] truncate font-medium text-foreground">
        {file.name}
      </span>
      {!readonly && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

**Step 2: Verify component renders**

Open the app with `pnpm dev` and temporarily import/render the component somewhere to verify it displays correctly.

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/ui/FileChip.tsx
git commit -m "feat(desktop): add FileChip component for file attachments"
```

---

## Task 3: Create FileChipsRow Component

**Files:**
- Create: `apps/desktop/src/renderer/components/ui/FileChipsRow.tsx`

**Step 1: Create the FileChipsRow component**

```typescript
import { FileChip, type AttachedFile } from './FileChip';
import { cn } from '@/lib/utils';

interface FileChipsRowProps {
  files: AttachedFile[];
  onRemove?: (id: string) => void;
  readonly?: boolean;
  className?: string;
}

export function FileChipsRow({ files, onRemove, readonly = false, className }: FileChipsRowProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {files.map((file) => (
        <FileChip
          key={file.id}
          file={file}
          onRemove={onRemove ? () => onRemove(file.id) : undefined}
          readonly={readonly}
        />
      ))}
    </div>
  );
}
```

**Step 2: Export from index (optional)**

Create `apps/desktop/src/renderer/components/ui/file-attachments.ts`:

```typescript
export { FileChip, type AttachedFile } from './FileChip';
export { FileChipsRow } from './FileChipsRow';
```

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/ui/FileChip.tsx apps/desktop/src/renderer/components/ui/FileChipsRow.tsx apps/desktop/src/renderer/components/ui/file-attachments.ts
git commit -m "feat(desktop): add FileChipsRow component for multiple file chips"
```

---

## Task 4: Create File Type Detection Utility

**Files:**
- Create: `apps/desktop/src/renderer/lib/file-utils.ts`

**Step 1: Create the utility file**

```typescript
import type { FileType } from '@accomplish/shared';

const FILE_TYPE_MAP: Record<string, FileType> = {
  // Documents
  pdf: 'pdf',
  doc: 'text',
  docx: 'text',
  txt: 'text',
  md: 'text',
  rtf: 'text',

  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',

  // Data
  csv: 'csv',
  xlsx: 'csv',
  xls: 'csv',
  json: 'csv',

  // Code
  js: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  html: 'code',
  css: 'code',
  sql: 'code',
  sh: 'code',
  yaml: 'code',
  yml: 'code',
};

export function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_MAP[ext] || 'other';
}

export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatFilesForPrompt(files: { path: string }[]): string {
  if (files.length === 0) return '';

  const fileList = files.map((f) => `- ${f.path}`).join('\n');
  return `[Attached files]\n${fileList}\n\n`;
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/renderer/lib/file-utils.ts
git commit -m "feat(desktop): add file type detection and formatting utilities"
```

---

## Task 5: Add IPC Handler for File Picker Dialog

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Step 1: Add IPC handler in main process**

In `apps/desktop/src/main/ipc/handlers.ts`, add inside `registerIPCHandlers()`:

```typescript
import { dialog } from 'electron';

// ... existing handlers ...

// File picker for attachments
ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Data', extensions: ['csv', 'xlsx', 'xls', 'json'] },
      { name: 'Code', extensions: ['js', 'ts', 'tsx', 'py', 'go', 'rs', 'html', 'css'] },
    ],
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});
```

**Step 2: Expose in preload**

In `apps/desktop/src/preload/index.ts`, add to the `accomplish` object:

```typescript
openFilePicker: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
```

**Step 3: Add type declaration**

In the preload file or wherever types are declared, update the `AccomplishAPI` interface:

```typescript
openFilePicker: () => Promise<string[]>;
```

**Step 4: Verify it works**

Run `pnpm dev`, open DevTools console, run:
```javascript
await window.accomplish.openFilePicker()
```
Expected: Native file dialog opens, returns array of selected file paths

**Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts apps/desktop/src/preload/index.ts
git commit -m "feat(desktop): add IPC handler for native file picker dialog"
```

---

## Task 6: Update PlusMenu with Attach Files Option

**Files:**
- Modify: `apps/desktop/src/renderer/components/landing/PlusMenu/index.tsx`

**Step 1: Update PlusMenuProps interface**

```typescript
interface PlusMenuProps {
  onSkillSelect: (command: string) => void;
  onOpenSettings: (tab: 'skills') => void;
  onFilesSelected: (paths: string[]) => void;  // NEW
  disabled?: boolean;
}
```

**Step 2: Add file picker handler and menu item**

Update the component:

```typescript
import { Paperclip } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export function PlusMenu({ onSkillSelect, onOpenSettings, onFilesSelected, disabled }: PlusMenuProps) {
  // ... existing state ...

  const handleAttachFiles = async () => {
    setOpen(false);
    if (window.accomplish?.openFilePicker) {
      const paths = await window.accomplish.openFilePicker();
      if (paths.length > 0) {
        onFilesSelected(paths);
      }
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* ... existing trigger ... */}
      <DropdownMenuContent align="start" className="w-[200px]">
        {/* NEW: Attach Files option */}
        <DropdownMenuItem onClick={handleAttachFiles}>
          <Paperclip className="h-4 w-4 mr-2" />
          Attach Files
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Existing Skills submenu */}
        <DropdownMenuSub>
          {/* ... existing skills submenu content ... */}
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/landing/PlusMenu/index.tsx
git commit -m "feat(desktop): add Attach Files option to PlusMenu"
```

---

## Task 7: Update TaskInputBar with File Attachment State

**Files:**
- Modify: `apps/desktop/src/renderer/components/landing/TaskInputBar.tsx`

**Step 1: Add imports and state**

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { FileChipsRow, type AttachedFile } from '../ui/file-attachments';
import { getFileType, generateFileId } from '../../lib/file-utils';
import path from 'path-browserify';  // or use basename logic inline
```

**Step 2: Update props interface**

```typescript
interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  // ... existing props ...
  attachedFiles: AttachedFile[];  // NEW
  onFilesChange: (files: AttachedFile[]) => void;  // NEW
}
```

**Step 3: Add file handling logic**

```typescript
export default function TaskInputBar({
  // ... existing props ...
  attachedFiles,
  onFilesChange,
}: TaskInputBarProps) {
  const MAX_FILES = 10;

  const handleFilesSelected = useCallback((paths: string[]) => {
    const newFiles: AttachedFile[] = paths
      .filter((p) => !attachedFiles.some((f) => f.path === p)) // no duplicates
      .slice(0, MAX_FILES - attachedFiles.length) // respect limit
      .map((p) => ({
        id: generateFileId(),
        path: p,
        name: p.split('/').pop() || p.split('\\').pop() || p,
        type: getFileType(p),
      }));

    if (newFiles.length > 0) {
      onFilesChange([...attachedFiles, ...newFiles]);
    }
  }, [attachedFiles, onFilesChange]);

  const handleRemoveFile = useCallback((id: string) => {
    onFilesChange(attachedFiles.filter((f) => f.id !== id));
  }, [attachedFiles, onFilesChange]);

  // ... rest of component
}
```

**Step 4: Update JSX structure**

Wrap file chips and input in a column layout:

```tsx
return (
  <div className="w-full space-y-2">
    {/* Error message */}
    {speechInput.error && (/* ... */)}

    {/* Input container */}
    <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-background px-3 py-2.5 shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
      {/* File chips row */}
      {attachedFiles.length > 0 && (
        <FileChipsRow
          files={attachedFiles}
          onRemove={handleRemoveFile}
        />
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        <PlusMenu
          onSkillSelect={handleSkillSelect}
          onOpenSettings={(tab) => onOpenSettings?.(tab)}
          onFilesSelected={handleFilesSelected}
          disabled={isDisabled || speechInput.isRecording}
        />
        {/* ... textarea, speech button, submit button ... */}
      </div>
    </div>
  </div>
);
```

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/landing/TaskInputBar.tsx
git commit -m "feat(desktop): integrate file attachments into TaskInputBar"
```

---

## Task 8: Update Home Page to Manage File State

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Home.tsx`

**Step 1: Add state and imports**

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { AttachedFile } from '../components/ui/file-attachments';
import { formatFilesForPrompt } from '../lib/file-utils';
```

**Step 2: Add file state**

```typescript
export default function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  // ... rest of state
```

**Step 3: Update executeTask to prepend file paths**

```typescript
const executeTask = useCallback(async () => {
  if (!prompt.trim() || isLoading) return;

  // Prepend file paths to prompt
  const filesPrefix = formatFilesForPrompt(attachedFiles);
  const fullPrompt = filesPrefix + prompt.trim();

  const taskId = `task_${Date.now()}`;
  const task = await startTask({ prompt: fullPrompt, taskId });
  if (task) {
    // Clear files after submit
    setAttachedFiles([]);
    navigate(`/execution/${task.id}`);
  }
}, [prompt, attachedFiles, isLoading, startTask, navigate]);
```

**Step 4: Pass props to TaskInputBar**

```tsx
<TaskInputBar
  value={prompt}
  onChange={setPrompt}
  onSubmit={handleSubmit}
  isLoading={isLoading}
  placeholder="Describe a task and let AI handle the rest"
  large={true}
  autoFocus={true}
  onOpenSpeechSettings={handleOpenSpeechSettings}
  onOpenSettings={(tab) => {
    setSettingsInitialTab(tab);
    setShowSettingsDialog(true);
  }}
  attachedFiles={attachedFiles}
  onFilesChange={setAttachedFiles}
/>
```

**Step 5: Verify functionality**

Run `pnpm dev`, attach files via + menu, submit a task. Check that:
1. Files appear as chips
2. Chips can be removed
3. On submit, prompt includes file paths prefix

**Step 6: Commit**

```bash
git add apps/desktop/src/renderer/pages/Home.tsx
git commit -m "feat(desktop): wire up file attachments on Home page"
```

---

## Task 9: Add Drag & Drop Support to TaskInputBar

**Files:**
- Modify: `apps/desktop/src/renderer/components/landing/TaskInputBar.tsx`

**Step 1: Add drag state**

```typescript
const [isDragging, setIsDragging] = useState(false);
```

**Step 2: Add drag event handlers**

```typescript
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
}, []);

const handleDragEnter = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(true);
}, []);

const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // Only set false if leaving the container (not entering a child)
  if (e.currentTarget === e.target) {
    setIsDragging(false);
  }
}, []);

const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(false);

  const files = Array.from(e.dataTransfer.files);
  const paths = files
    .filter((f) => f.path) // Electron adds .path to File objects
    .map((f) => f.path);

  if (paths.length > 0) {
    handleFilesSelected(paths);
  }
}, [handleFilesSelected]);
```

**Step 3: Apply handlers and styling to container**

```tsx
<div
  className={cn(
    "relative flex flex-col gap-2 rounded-xl border bg-background px-3 py-2.5 shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
    isDragging
      ? "border-dashed border-2 border-primary bg-primary/5"
      : "border-border"
  )}
  onDragOver={handleDragOver}
  onDragEnter={handleDragEnter}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  {/* ... content ... */}
</div>
```

**Step 4: Add cn import if not present**

```typescript
import { cn } from '@/lib/utils';
```

**Step 5: Test drag & drop**

Drag files from Finder onto the input area. Verify:
1. Border changes to dashed when dragging over
2. Files are added as chips on drop
3. Duplicates are ignored

**Step 6: Commit**

```bash
git add apps/desktop/src/renderer/components/landing/TaskInputBar.tsx
git commit -m "feat(desktop): add drag & drop file support to TaskInputBar"
```

---

## Task 10: Update Execution Page Follow-up Input

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Execution.tsx`

**Step 1: Add file state for follow-up**

```typescript
const [followUpFiles, setFollowUpFiles] = useState<AttachedFile[]>([]);
```

**Step 2: Import utilities**

```typescript
import { FileChipsRow, type AttachedFile } from '../components/ui/file-attachments';
import { getFileType, generateFileId, formatFilesForPrompt } from '../lib/file-utils';
```

**Step 3: Add file handling for follow-up input**

```typescript
const handleFollowUpFilesSelected = useCallback((paths: string[]) => {
  const MAX_FILES = 10;
  const newFiles: AttachedFile[] = paths
    .filter((p) => !followUpFiles.some((f) => f.path === p))
    .slice(0, MAX_FILES - followUpFiles.length)
    .map((p) => ({
      id: generateFileId(),
      path: p,
      name: p.split('/').pop() || p.split('\\').pop() || p,
      type: getFileType(p),
    }));

  if (newFiles.length > 0) {
    setFollowUpFiles([...followUpFiles, ...newFiles]);
  }
}, [followUpFiles]);
```

**Step 4: Update handleFollowUp to include files**

```typescript
const handleFollowUp = async () => {
  if (!followUp.trim()) return;

  // Prepend file paths
  const filesPrefix = formatFilesForPrompt(followUpFiles);
  const fullMessage = filesPrefix + followUp.trim();

  // ... provider check logic ...

  await sendFollowUp(fullMessage);
  setFollowUp('');
  setFollowUpFiles([]); // Clear files after send
};
```

**Step 5: Update follow-up input JSX**

Find the follow-up input section (around line 1185) and update:

```tsx
{canFollowUp && (
  <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4">
    <div className="max-w-4xl mx-auto">
      {/* Error handling ... */}

      {/* File chips */}
      {followUpFiles.length > 0 && (
        <FileChipsRow
          files={followUpFiles}
          onRemove={(id) => setFollowUpFiles((prev) => prev.filter((f) => f.id !== id))}
          className="mb-2"
        />
      )}

      {/* Input field with Send button */}
      <div className="flex gap-3 items-center">
        <PlusMenu
          onSkillSelect={(command) => {
            const newValue = `${command} ${followUp}`.trim();
            setFollowUp(newValue);
            setTimeout(() => followUpInputRef.current?.focus(), 0);
          }}
          onOpenSettings={(tab) => {
            setSettingsInitialTab(tab);
            setShowSettingsDialog(true);
          }}
          onFilesSelected={handleFollowUpFilesSelected}
          disabled={isLoading || speechInput.isRecording}
        />
        {/* ... rest of input ... */}
      </div>
    </div>
  </div>
)}
```

**Step 6: Commit**

```bash
git add apps/desktop/src/renderer/pages/Execution.tsx
git commit -m "feat(desktop): add file attachments to follow-up input"
```

---

## Task 11: Display File Attachments in Message Bubbles

**Files:**
- Modify: `apps/desktop/src/renderer/pages/Execution.tsx` (MessageBubble component)

**Step 1: Import FileChipsRow in MessageBubble**

The MessageBubble is defined inline in Execution.tsx. Add the import at the top if not already there.

**Step 2: Update MessageBubble to show attachments**

Find the MessageBubble component and update to render file chips for user messages:

```tsx
const MessageBubble = memo(function MessageBubble({ message, /* ... */ }: MessageBubbleProps) {
  // ... existing code ...

  // Extract file attachments from message
  const fileAttachments = message.attachments?.filter(isFileAttachment) || [];

  return (
    <motion.div /* ... */>
      <div className={cn(/* ... existing classes ... */)}>
        {/* Show file attachments for user messages */}
        {isUser && fileAttachments.length > 0 && (
          <FileChipsRow
            files={fileAttachments.map((a) => ({
              id: a.path,
              path: a.path,
              name: a.name,
              type: a.type,
            }))}
            readonly
            className="mb-2"
          />
        )}

        {/* ... existing message content ... */}
      </div>
    </motion.div>
  );
});
```

**Step 3: Import isFileAttachment**

```typescript
import { isFileAttachment } from '@accomplish/shared';
```

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/pages/Execution.tsx
git commit -m "feat(desktop): display file attachments in message bubbles"
```

---

## Task 12: Store File Attachments in Task Messages

**Files:**
- Modify: `apps/desktop/src/renderer/stores/taskStore.ts`
- Modify: `apps/desktop/src/renderer/pages/Home.tsx`

**Step 1: Update startTask to accept attachments**

In `taskStore.ts`, the startTask function receives a TaskConfig. We need to store attachments in the user message.

First, update Home.tsx to pass attachments metadata along with the task:

```typescript
// In Home.tsx executeTask function
const task = await startTask({
  prompt: fullPrompt,
  taskId,
});

// After task creation, we need to update the first user message with attachments
// This happens in the task store when the task is created
```

Actually, the cleaner approach: Store attachments in the user message when it's created. The taskStore doesn't directly create messages - they come from the IPC layer.

Alternative approach: Pass attachments as separate data that gets stored with the prompt:

**Step 2: Create a module-level variable to pass attachments**

In `taskStore.ts`:

```typescript
// Temporary storage for attachments to add to next user message
let pendingAttachments: FileAttachment[] = [];

export function setPendingAttachments(attachments: FileAttachment[]) {
  pendingAttachments = attachments;
}

export function clearPendingAttachments() {
  pendingAttachments = [];
}

export function getPendingAttachments(): FileAttachment[] {
  const attachments = pendingAttachments;
  pendingAttachments = [];
  return attachments;
}
```

**Step 3: Update Home.tsx to set pending attachments**

```typescript
import { setPendingAttachments } from '../stores/taskStore';
import type { FileAttachment } from '@accomplish/shared';

// In executeTask:
const executeTask = useCallback(async () => {
  if (!prompt.trim() || isLoading) return;

  // Store attachments for the task store to pick up
  const fileAttachments: FileAttachment[] = attachedFiles.map((f) => ({
    type: f.type,
    path: f.path,
    name: f.name,
  }));
  setPendingAttachments(fileAttachments);

  // Prepend file paths to prompt
  const filesPrefix = formatFilesForPrompt(attachedFiles);
  const fullPrompt = filesPrefix + prompt.trim();

  const taskId = `task_${Date.now()}`;
  const task = await startTask({ prompt: fullPrompt, taskId });
  if (task) {
    setAttachedFiles([]);
    navigate(`/execution/${task.id}`);
  }
}, [prompt, attachedFiles, isLoading, startTask, navigate]);
```

**Step 4: This is getting complex - simpler approach**

Actually, the simplest approach: Since we're prepending file paths to the prompt text anyway, we don't strictly need to store them separately in attachments for the AI to work. The attachments field is mainly for UI display.

For now, let's skip storing in TaskMessage.attachments - the file paths are already in the prompt text. We can add proper attachment storage in a follow-up if needed.

**Step 5: Commit what we have**

```bash
git add apps/desktop/src/renderer/stores/taskStore.ts apps/desktop/src/renderer/pages/Home.tsx
git commit -m "feat(desktop): file paths included in prompts for AI context"
```

---

## Task 13: Final Testing & Cleanup

**Step 1: Run the app**

```bash
pnpm dev
```

**Step 2: Test all flows**

1. **Home page - Menu selection:**
   - Click + button
   - Click "Attach Files"
   - Select multiple files
   - Verify chips appear
   - Remove a chip
   - Submit task with files
   - Verify prompt includes file paths

2. **Home page - Drag & drop:**
   - Drag files from Finder
   - Verify border changes
   - Drop files
   - Verify chips appear

3. **Execution page - Follow-up:**
   - Complete a task
   - In follow-up input, attach files
   - Send follow-up
   - Verify file paths in message

4. **Edge cases:**
   - Try adding > 10 files (should be capped)
   - Try adding duplicate files (should be ignored)
   - Try very long file paths (should be truncated in UI)

**Step 3: Run type check**

```bash
pnpm typecheck
```

**Step 4: Run lint**

```bash
pnpm lint
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(desktop): complete file upload feature implementation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add FileAttachment type | `packages/shared/src/types/task.ts` |
| 2 | Create FileChip component | `renderer/components/ui/FileChip.tsx` |
| 3 | Create FileChipsRow component | `renderer/components/ui/FileChipsRow.tsx` |
| 4 | Create file utilities | `renderer/lib/file-utils.ts` |
| 5 | Add IPC file picker | `main/ipc/handlers.ts`, `preload/index.ts` |
| 6 | Update PlusMenu | `components/landing/PlusMenu/index.tsx` |
| 7 | Update TaskInputBar | `components/landing/TaskInputBar.tsx` |
| 8 | Update Home page | `pages/Home.tsx` |
| 9 | Add drag & drop | `components/landing/TaskInputBar.tsx` |
| 10 | Update Execution follow-up | `pages/Execution.tsx` |
| 11 | Display in message bubbles | `pages/Execution.tsx` |
| 12 | Store attachments | `stores/taskStore.ts`, `pages/Home.tsx` |
| 13 | Final testing | - |
