const ICON_MAP: Record<string, string> = {
  'slack.com': '/assets/icons/integrations/slack.png',
  'google.com': '/assets/icons/integrations/chrome.png',
  'notion.so': '/assets/icons/integrations/notion.png',
  'docs.google.com': '/assets/icons/integrations/google-docs.png',
  'calendar.google.com': '/assets/icons/integrations/google-calendar.png',
  'sheets.google.com': '/assets/icons/integrations/google-sheets.png',
  'slides.google.com': '/assets/icons/integrations/google-slides.png',
  'mail.google.com': '/assets/icons/integrations/gmail.png',
  'linkedin.com': '/assets/icons/integrations/linkedin.png',
  'eventbrite.com': '/assets/icons/integrations/eventbrite.png',
  'finance.yahoo.com': '/assets/icons/integrations/yahoo-finance.png',
};

export function IntegrationIcon({ domain, className }: { domain: string; className?: string }) {
  const src = ICON_MAP[domain] ?? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  return <img alt={domain} src={src} className={className} loading="lazy" />;
}
