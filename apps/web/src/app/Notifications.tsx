import { useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { useAuth } from '../features/auth/model/session.js';

export function Notifications() {
  const { status, notice } = useAuth();
  useEffect(() => {
    if (status !== 'authenticated') toast.dismiss(); else toast.dismiss('session-notice');
    if (notice === 'signed-out') toast.success('Saliste de Cenit', { id: 'session-notice', className: 'cenit-toast--signed-out' });
    if (notice === 'expired') toast.warning('Tu sesión terminó', { id: 'session-notice', description: 'Vuelve a iniciar sesión para continuar.' });
  }, [status, notice]);
  return <Toaster position="bottom-right" theme="light" duration={5000} visibleToasts={3} closeButton offset={20} containerAriaLabel="Avisos"
    icons={{ success: <CheckCircleIcon size={20} />, warning: <WarningCircleIcon size={20} />, error: <WarningCircleIcon size={20} />, info: <InfoIcon size={20} /> }}
    toastOptions={{ className: 'cenit-toast', closeButtonAriaLabel: 'Cerrar aviso', classNames: { title: 'cenit-toast-title', description: 'cenit-toast-description', closeButton: 'cenit-toast-close' } }} />;
}
