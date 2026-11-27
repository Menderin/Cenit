import { useEffect, useRef, useState } from 'react';

/** Conserva la modalidad hasta que termina la salida del panel. */
export function usePurchaseDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!closing) return;
    const element = dialog.current!;
    let active = true;
    void Promise.allSettled(element.getAnimations().map(animation => animation.finished)).then(() => {
      if (active) element.close();
    });
    return () => { active = false; };
  }, [closing]);
  return { dialog, closing, close: () => setClosing(true) };
}
