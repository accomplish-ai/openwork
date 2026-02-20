import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initTheme } from './lib/theme';
import { initI18n } from './i18n';
import { router } from './router';
import './styles/globals.css';
import { setupMockAccomplish } from './lib/mock';

// Initialize mock API if running in browser dev mode
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (import.meta.env.DEV && !(window as any).accomplish) {
  setupMockAccomplish();
}

try {
  initTheme();
} catch (e) {
  console.warn('Failed to initialize theme (likely not running in Electron):', e);
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

initI18n().then(() => {
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
