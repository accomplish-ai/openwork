import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_HTML_PATH = path.resolve(__dirname, '../../../resources/fallback.html');

describe('Fallback Page', () => {
  const html = fs.readFileSync(FALLBACK_HTML_PATH, 'utf-8');

  it('exists at the expected path', () => {
    expect(fs.existsSync(FALLBACK_HTML_PATH)).toBe(true);
  });

  it('is valid HTML with required structure', () => {
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains the retry button', () => {
    expect(html).toContain('<button');
    expect(html).toContain('Retry');
  });

  it('uses accomplish.retryLoad when available', () => {
    expect(html).toContain('window.accomplish.retryLoad');
  });

  it('falls back to window.location.reload', () => {
    expect(html).toContain('window.location.reload()');
  });

  it('contains the error detail element for displaying error info', () => {
    expect(html).toContain('id="error-detail"');
  });

  it('reads error code and description from query params', () => {
    expect(html).toContain("params.get('code')");
    expect(html).toContain("params.get('desc')");
  });

  it('is fully self-contained with no external dependencies', () => {
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/);
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/);
    expect(html).toContain('<style>');
    expect(html).toContain('<svg');
  });

  it('has user-facing connection error messaging', () => {
    expect(html).toContain('Unable to Connect');
    expect(html).toContain('internet connection');
  });

  it('has no inline event handlers on the button', () => {
    expect(html).not.toMatch(/<button[^>]+onclick/);
  });

  it('has animations for page load and retry state', () => {
    expect(html).toContain('@keyframes fadeIn');
    expect(html).toContain('@keyframes pulse');
    expect(html).toContain('@keyframes spin');
    expect(html).toContain('.spinner');
  });

  it('shows retrying state with spinner on click', () => {
    expect(html).toContain("classList.add('retrying')");
    expect(html).toContain('Retrying');
  });
});
