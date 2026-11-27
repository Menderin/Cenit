import { useState } from 'react';
import { suggestDescriptionFormat } from '../model/description-format.js';

export function DescriptionFormatSuggestion({ id, value, providers, disabled, onApply }: {
  id: string; value: string; providers: string[]; disabled: boolean; onApply: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const proposal = suggestDescriptionFormat(value, providers);
  if (proposal === value) return null;
  function close() { setOpen(false); document.getElementById(id)?.focus({ preventScroll: true }); }
  return <div className="purchase-format">
    <button className="purchase-format__trigger" type="button" disabled={disabled} aria-expanded={open} aria-controls={`${id}-format`} onClick={() => setOpen(!open)}>Normalizar mayúsculas<span className="purchase-sr-only"> de la descripción</span></button>
    <div id={`${id}-format`} className="purchase-format__preview" hidden={!open}>
      <p><strong>Propuesta</strong> · Revisa los nombres propios. Se ajustan las iniciales cuando el nombre coincide con el proveedor junto a un RUT válido.</p>
      <p className="purchase-format__text">{proposal}</p>
      <div className="purchase-format__actions">
        <button type="button" className="cenit-button" disabled={disabled} onClick={() => { onApply(proposal); close(); }}>Aplicar normalización</button>
        <button type="button" className="cenit-button" disabled={disabled} onClick={close}>Conservar texto actual</button>
      </div>
    </div>
  </div>;
}
