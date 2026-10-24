import { useEffect, useRef, useState } from 'react';
import { useExitPresence } from './use-exit-presence.js';

// Both workspaces use the same mobile focus boundary; desktop keeps normal navigation.
export function useSidebar(pathname: string, breakpoint = 760) {
  const [mobile, setMobile] = useState(() => window.matchMedia(`(max-width: ${breakpoint}px)`).matches);
  const [collapsed, setCollapsed] = useState(mobile);
  const sidebar = useRef<HTMLElement>(null), panel = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const presence = useExitPresence(!collapsed);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const resize = () => { setMobile(media.matches); setCollapsed(media.matches); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, [breakpoint]);
  useEffect(() => { if (mobile) setCollapsed(true); }, [pathname, mobile]);
  useEffect(() => {
    if (!mobile || collapsed || !sidebar.current || !panel.current) return;
    const background = panel.current, navigation = sidebar.current;
    const previous = background.inert, overflow = document.body.style.overflow;
    background.inert = true; document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(navigation.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary')).filter(element => element.getClientRects().length > 0);
    const focusFrame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('.cenit-confirm-overlay, dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); setCollapsed(true); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(focusFrame);
      background.inert = previous; document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (navigation.contains(document.activeElement) || document.activeElement === document.body) toggle.current?.focus({ preventScroll: true });
    };
  }, [mobile, collapsed]);
  return { mobile, collapsed, setCollapsed, sidebar, panel, toggle, ...presence };
}
