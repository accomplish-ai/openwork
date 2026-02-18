interface AboutTabProps {
  appVersion: string;
}

export function AboutTab({ appVersion }: AboutTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">Visit us</div>
            <a
              href="https://www.accomplish.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              www.accomplish.ai
            </a>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Have a question?</div>
            <a href="mailto:support@accomplish.ai" className="text-primary hover:underline">
              support@accomplish.ai
            </a>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Version</div>
            <div className="font-medium">{appVersion || 'Loading...'}</div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
          Accomplish™ All rights reserved.
        </div>
      </div>
    </div>
  );
}
