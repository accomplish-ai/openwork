import slackIcon from '/assets/icons/integrations/slack.png';
import chromeIcon from '/assets/icons/integrations/chrome.png';
import notionIcon from '/assets/icons/integrations/notion.png';
import googleDocsIcon from '/assets/icons/integrations/google-docs.png';
import googleCalendarIcon from '/assets/icons/integrations/google-calendar.png';
import googleSheetsIcon from '/assets/icons/integrations/google-sheets.png';
import googleSlidesIcon from '/assets/icons/integrations/google-slides.png';
import gmailIcon from '/assets/icons/integrations/gmail.png';
import linkedinIcon from '/assets/icons/integrations/linkedin.png';
import eventbriteIcon from '/assets/icons/integrations/eventbrite.png';
import yahooFinanceIcon from '/assets/icons/integrations/yahoo-finance.png';

const ICON_MAP: Record<string, string> = {
  'slack.com': slackIcon,
  'google.com': chromeIcon,
  'notion.so': notionIcon,
  'docs.google.com': googleDocsIcon,
  'calendar.google.com': googleCalendarIcon,
  'sheets.google.com': googleSheetsIcon,
  'slides.google.com': googleSlidesIcon,
  'mail.google.com': gmailIcon,
  'linkedin.com': linkedinIcon,
  'eventbrite.com': eventbriteIcon,
  'finance.yahoo.com': yahooFinanceIcon,
};

export function IntegrationIcon({ domain, className }: { domain: string; className?: string }) {
  const src = ICON_MAP[domain] ?? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  return <img alt={domain} src={src} className={className} loading="lazy" />;
}
