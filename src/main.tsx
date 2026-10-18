import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, readTheme } from './features/theme/theme';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { captureSharedLinks } from './features/mobile';
import { prepareMobileSupport } from './features/mobile/serviceWorker';
import './styles/tokens.css';
import './styles/global.css';
import './styles/dashboard.css';
import './styles/downloads.css';
import './styles/premium.css';
import './styles/settings.css';
import './styles/responsive.css';
import './styles/enhancements.css';
import './styles/library.css';
import './styles/media.css';
import './styles/bulk.css';

applyTheme(readTheme());
captureSharedLinks(window);
prepareMobileSupport(window);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The application root is missing.');
}
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
