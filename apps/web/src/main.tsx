import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './features/auth/model/session.js';
import { App } from './app/App.js';
import './styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider>,
);
