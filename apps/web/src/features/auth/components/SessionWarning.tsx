import { useEffect, useState } from 'react';
import { StatusNotice } from '../../../shared/components/StatusNotice.js';

const warningWindow = 5 * 60 * 1000;
export function SessionWarning({ expiresAt, logout }: { expiresAt: string; logout: (origin?: HTMLElement) => Promise<void> }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      setMinutes(remaining > 0 && remaining <= warningWindow ? Math.ceil(remaining / 60000) : null);
      if (remaining > 0) {
        const next = remaining > warningWindow ? remaining - warningWindow : remaining % 60000 || 60000;
        timer = setTimeout(tick, Math.min(remaining, next));
      }
    };
    tick();
    return () => clearTimeout(timer);
  }, [expiresAt]);
  if (minutes === null) return null;
  return <aside className="cenit-session-warning" aria-label="Aviso de vencimiento de sesión">
    <StatusNotice kind="warning" title="La sesión está por vencer" message={`Tu sesión vencerá en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}. Guarda tu trabajo antes de volver a iniciar sesión.`}>
      <button className="cenit-ui-button" onClick={event => { event.currentTarget.focus({ preventScroll: true }); void logout(event.currentTarget); }}>Cerrar sesión ahora</button>
    </StatusNotice>
  </aside>;
}
