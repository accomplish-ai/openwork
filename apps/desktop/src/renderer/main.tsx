import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import './i18n'; // Import i18n configuration
import { getAccomplish } from './lib/accomplish';

// Initialize i18n from stored language setting
async function initializeLanguage() {
  const accomplish = getAccomplish();
  const i18n = (await import('./i18n')).default;

  try {
    const language = await accomplish.getLanguage();
    await i18n.changeLanguage(language);
  } catch (error) {
    console.error('Failed to load language preference:', error);
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Initialize language before rendering
initializeLanguage().then(() => {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  );
});
