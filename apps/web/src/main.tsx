import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './features/auth/model/session.js';
import { App } from './app/App.js';
import './styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const router = createBrowserRouter([{ path: '*', element: <AuthProvider><App /></AuthProvider> }]);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>,
);
