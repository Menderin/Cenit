import { useLayoutEffect, useRef } from 'react';

// Las listas de Inicio comparten el alto (recortar una le deja más espacio a la otra). Después de cada ajuste se revisan
// todas en el cuadro siguiente y se vuelve a ajustar la que haya quedado desfasada.
const checks = new Set<() => void>();
let pending = 0;
const revalidate = () => {
  if (!pending) pending = requestAnimationFrame(() => { pending = 0; for (const check of [...checks]) check(); });
};

/**
 * Cuando Inicio se ajusta a la ventana, una lista con más filas de las que caben recorta su alto justo al final de la
 * última fila completa (nunca se ve media fila) y desplaza el resto dentro de sí. Si sobra alto bajo esa fila, se
 * reparte entre las filas visibles (`--fit-extra`, que las filas usan como relleno) para que la lista llene su caja sin
 * dejar un hueco. Si la página desplaza, la lista no tiene límite de alto y no cambia nada; si sobra alto, la lista puede
 * estirarse para llenarlo (el tope es `max-height`, no `height`). `box` es el espacio disponible; `list`, lo que
 * desplaza; las filas llevan `data-row`. Una lista sin controles propios se vuelve enfocable cuando desplaza, para
 * recorrerla con teclado. La caja recibe `--fit-natural`, el alto de la lista completa.
 */
export function useWholeRows<Box extends HTMLElement, List extends HTMLElement>(rows: number, focusable = false) {
  const box = useRef<Box>(null), list = useRef<List>(null);
  useLayoutEffect(() => {
    const space = box.current, scroller = list.current;
    if (!space || !scroller) return;
    const height = () => space.getBoundingClientRect().height;
    const signature = () => `${height()}:${scroller.scrollHeight}`;
    let seen = '';
    const update = () => {
      scroller.style.maxHeight = '';
      scroller.style.removeProperty('--fit-extra');
      // Alto natural de la lista, sin recortes: la columna lateral reserva este alto para repartir su espacio por partes
      // iguales sin que el recorte de una lista cambie el reparto (home.css, `--fit-natural`).
      space.style.setProperty('--fit-natural', `${scroller.scrollHeight}px`);
      let available = height();
      const limited = scroller.scrollHeight > available + 1;
      if (limited) {
        const top = scroller.getBoundingClientRect().top - scroller.scrollTop;
        const bottoms = [...scroller.querySelectorAll<HTMLElement>('[data-row]')].map(row => row.getBoundingClientRect().bottom - top);
        let end = 0, shown = 0, next = available;
        // Recortar la lista cambia el alto que flexbox le deja a su caja: se vuelve a cortar hasta que el corte quepa.
        for (let attempt = 0; attempt <= bottoms.length; attempt++) {
          end = 0; shown = 0;
          for (const bottom of bottoms) if (bottom <= available + .5) { end = bottom; shown++; } else break;
          const limit = end || available;
          scroller.style.maxHeight = `${limit}px`;
          next = height();
          if (next + .5 >= limit) break;
          available = next;
        }
        // La caja es más alta que las filas completas: el sobrante se reparte entre ellas en vez de quedar en blanco.
        const spare = next - end;
        if (end && shown && spare > 1) {
          scroller.style.setProperty('--fit-extra', `${Math.floor(spare / shown * 10) / 10}px`);
          scroller.style.maxHeight = `${next}px`;
        }
      }
      if (focusable) {
        if (limited) scroller.tabIndex = 0; else scroller.removeAttribute('tabindex');
      }
      seen = signature();
      revalidate();
    };
    const check = () => { if (signature() !== seen) update(); };
    update();
    checks.add(check);
    // También cuando cambia el alto de las filas sin que cambie el espacio (fuentes que terminan de cargar, datos nuevos).
    const observer = new ResizeObserver(update);
    observer.observe(space);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    let active = true;
    void document.fonts?.ready.then(() => { if (active) update(); });
    return () => { active = false; checks.delete(check); observer.disconnect(); };
  }, [rows, focusable]);
  return [box, list] as const;
}
