import { useEffect, useState } from 'react';

// Keep a closing primitive for its CSS transition; a protected-tree unmount stays immediate.
export function useExitPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    if (!present) return;
    const timer = window.setTimeout(() => setPresent(false), 150);
    return () => clearTimeout(timer);
  }, [open, present]);
  return { mounted: open || present, closing: !open && present };
}
