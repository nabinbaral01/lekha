import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import './i18n';
import './index.css';
import { PrefsProvider } from './lib/prefs';
import { SessionProvider } from './lib/session';
import App from './App';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15000 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <PrefsProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </PrefsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
