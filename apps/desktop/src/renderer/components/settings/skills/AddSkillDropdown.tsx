// apps/desktop/src/renderer/components/settings/skills/AddSkillDropdown.tsx

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface AddSkillDropdownProps {
  onBuildWithAI: () => void;
  onUpload: () => void;
  onAddFromOfficial: () => void;
  onImportFromGitHub: () => void;
}

export function AddSkillDropdown({
  onBuildWithAI,
  onUpload,
  onAddFromOfficial,
  onImportFromGitHub,
}: AddSkillDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={onBuildWithAI} className="flex-col items-start gap-0.5 py-2.5">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            <span className="font-medium">Build with AI</span>
          </div>
          <span className="pl-6 text-xs text-muted-foreground">
            Create skills through conversation
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onUpload} className="flex-col items-start gap-0.5 py-2.5">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="font-medium">Upload a skill</span>
          </div>
          <span className="pl-6 text-xs text-muted-foreground">
            Upload .zip, .skill, or folder
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onAddFromOfficial} className="flex-col items-start gap-0.5 py-2.5">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="font-medium">Add from official</span>
          </div>
          <span className="pl-6 text-xs text-muted-foreground">
            Pre-built skills by Openwork
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onImportFromGitHub} className="flex-col items-start gap-0.5 py-2.5">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
            </svg>
            <span className="font-medium">Import from GitHub</span>
          </div>
          <span className="pl-6 text-xs text-muted-foreground">
            Paste a repository link
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
