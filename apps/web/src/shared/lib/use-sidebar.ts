import { useState } from 'react';

// Escritorio únicamente: la barra lateral se pliega y se despliega, sin modo cajón ni trampa de foco.
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return { collapsed, setCollapsed };
}
