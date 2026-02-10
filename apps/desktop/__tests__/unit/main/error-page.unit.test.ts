import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERROR_HTML_PATH = path.resolve(__dirname, '../../../resources/error.html');

describe('Error Page', () => {
  const html = fs.readFileSync(ERROR_HTML_PATH, 'utf-8');

  it('exists at the expected path', () => {
    expect(fs.existsSync(ERROR_HTML_PATH)).toBe(true);
  });

  it('is valid HTML with required structure', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains the retry button', () => {
    expect(html).toContain('<button');
    expect(html).toContain('Retry');
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
    // No external CSS/JS links
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/);
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/);
    // Inline styles and inline SVG only
    expect(html).toContain('<style>');
    expect(html).toContain('<svg');
  });

  it('has user-facing connection error messaging', () => {
    expect(html).toContain('Unable to Connect');
    expect(html).toContain('internet connection');
  });
});
