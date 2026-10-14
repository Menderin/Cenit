import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './features/auth/model/session.js';
import { App } from './app/App.js';
import { PurchaseDraftProvider } from './features/purchases/model/drafts.js';
import { Notifications } from './app/Notifications.js';
import './styles.css';
import './shared/components/ui.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const router = createBrowserRouter([{ path: '*', element: <AuthProvider><PurchaseDraftProvider><App /></PurchaseDraftProvider><Notifications /></AuthProvider> }]);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>,
);
