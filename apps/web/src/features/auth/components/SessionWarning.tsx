import { useEffect, useState } from 'react';

const warningWindow = 5 * 60 * 1000;
export function SessionWarning({ expiresAt, logout }: { expiresAt: string; logout: () => Promise<void> }) {
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
  return <aside className="mb-6 space-y-3 rounded border border-amber-500 bg-amber-50 p-4" aria-label="Aviso de vencimiento de sesión">
    <p role="status">Tu sesión vencerá en {minutes} {minutes === 1 ? 'minuto' : 'minutos'}. Guarda tu trabajo antes de volver a iniciar sesión.</p>
    <button className="cenit-access__primary" onClick={() => { void logout(); }}>Cerrar sesión ahora</button>
  </aside>;
}
