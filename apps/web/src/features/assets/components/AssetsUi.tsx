import { useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import type { AssetStatus, LoanStatus } from '@cenit/contracts/assets';
import { downloadPdf, getAssetSummary } from '../api/assets.js';
import { initials, loanStatuses, statuses } from '../model/labels.js';
import { HttpError } from '../../../shared/lib/http.js';

export const summaryKey = ['assets', 'summary'] as const;
export function useAssetSummary() {
  return useQuery({ queryKey: summaryKey, queryFn: ({ signal }) => getAssetSummary(signal), refetchOnMount: 'always' });
}

// Encabezado común de las cuatro vistas: acciones, cifras que filtran y pestañas.
export function AssetsHeader({ actions }: { actions?: ReactNode }) {
  const summary = useAssetSummary().data, location = useLocation(), [params] = useSearchParams();
  const path = location.pathname, status = params.get('estado');
  const tiles = [
    { to: '/administracion/bienes', label: 'Bienes registrados', value: summary?.total, detail: 'Todos los tipos', current: path === '/administracion/bienes' && !status && !params.get('responsable') },
    { to: '/administracion/bienes/prestamos', label: 'En préstamo', value: summary?.onLoan, current: path === '/administracion/bienes/prestamos',
      detail: summary?.overdue ? `${summary.overdue} con devolución vencida` : 'Sin devoluciones vencidas', tone: summary?.overdue ? 'late' : '' },
    { to: '/administracion/bienes?estado=revisar', label: 'Por revisar', value: summary?.review, current: status === 'revisar',
      detail: 'Su responsable ya no pertenece', tone: summary?.review ? 'warn' : '' },
    { to: '/administracion/bienes?estado=sin_responsable', label: 'Sin responsable', value: summary?.unassigned, detail: 'Registrados, sin entregar', current: status === 'sin_responsable' },
  ];
  const tabs = [
    { to: '/administracion/bienes', label: 'Inventario', count: summary?.total },
    { to: '/administracion/bienes/entregas', label: 'Entregas', count: summary?.deliveries },
    { to: '/administracion/bienes/prestamos', label: 'Préstamos', count: summary?.loans, tone: summary?.overdue ? 'late' : '' },
    { to: '/administracion/bienes/responsables', label: 'Responsables', count: summary?.people, tone: summary?.peopleReview ? 'warn' : '' },
  ];
  return <>
    <header className="assets-heading">
      <div><h1>Bienes</h1><p>Inventario, entregas y préstamos. Cada movimiento queda en la ficha del bien.</p></div>
      <div className="assets-actions" key={path}>{actions ?? <>
        <Link className="cenit-button" to="/administracion/bienes/prestamos/nuevo">Nuevo préstamo</Link>
        <Link className="cenit-button" to="/administracion/bienes/entregas/nueva">Nueva entrega</Link>
        <Link className="cenit-button cenit-button--primary" to="/administracion/bienes/nuevo"><PlusIcon size={16} aria-hidden="true" />Registrar bien</Link>
      </>}</div>
    </header>
    <ul className="assets-tiles" aria-label="Resumen de bienes">
      {tiles.map(tile => <li key={tile.label}><Link className="assets-tile" to={tile.to} aria-current={tile.current ? 'true' : undefined}>
        <span>{tile.label}</span><strong>{tile.value ?? '—'}</strong><small className={tile.tone ? `assets-${tile.tone}` : undefined}>{tile.detail}</small>
      </Link></li>)}
    </ul>
    <nav className="assets-tabs" aria-label="Secciones de Bienes">
      {tabs.map(tab => <Link key={tab.to} to={tab.to} aria-current={path === tab.to ? 'page' : undefined}>
        {tab.label}{tab.count !== undefined && <span className={`assets-count${tab.tone ? ` assets-count--${tab.tone}` : ''}`}>{tab.count}</span>}
      </Link>)}
    </nav>
  </>;
}

export function StatusChip({ status }: { status: AssetStatus }) {
  return <span className={`assets-chip assets-chip--${statuses[status].tone}`} title={statuses[status].help}>{statuses[status].label}</span>;
}
export function LoanChip({ status }: { status: LoanStatus }) {
  return <span className={`assets-chip assets-chip--${loanStatuses[status].tone}`}>{loanStatuses[status].label}</span>;
}
export function Avatar({ name, inactive = false }: { name: string; inactive?: boolean }) {
  return <span className={`assets-avatar${inactive ? ' assets-avatar--inactive' : ''}`} aria-hidden="true">{initials(name)}</span>;
}
export function BackLink({ to = '/administracion/bienes', children = 'Volver a Bienes' }: { to?: string; children?: ReactNode }) {
  return <Link className="assets-back" to={to}><ArrowLeftIcon size={14} aria-hidden="true" />{children}</Link>;
}
export function LoadState({ query, label }: { query: { isPending: boolean; isError: boolean; error: Error | null; refetch: () => unknown }; label: string }) {
  if (query.isPending) return <div className="assets-skeleton" role="status">Cargando {label}…<i /><i /><i /></div>;
  if (query.isError) return <div className="assets-state" role="alert"><p>{query.error?.message}</p><button type="button" className="cenit-button" onClick={() => { void query.refetch(); }}>Reintentar</button></div>;
  return null;
}

/** Botón que pide el PDF al servidor y lo descarga; informa el error junto al botón. */
export function PdfButton({ path, fileName, children, primary = false }: { path: string; fileName: string; children: ReactNode; primary?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run() {
    setBusy(true); setError('');
    try { await downloadPdf(path, fileName); } catch (cause) { setError(cause instanceof HttpError ? cause.message : 'No pudimos preparar el documento.'); } finally { setBusy(false); }
  }
  return <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
    <button type="button" className={`cenit-button${primary ? ' cenit-button--primary' : ''}`} onClick={() => { void run(); }} disabled={busy} aria-busy={busy}>
      <DownloadSimpleIcon size={16} aria-hidden="true" />{busy ? 'Preparando…' : children}
    </button>
    {error && <span className="assets-error" role="alert">{error}</span>}
  </span>;
}

// Campo de texto simple con etiqueta, ayuda y error.
export function TextField({ id, label, value, onChange, optional, hint, error, textarea, list, placeholder, inputMode, wide }: {
  id: string; label: string; value: string; onChange: (value: string) => void; optional?: boolean; hint?: string; error?: string;
  textarea?: boolean; list?: string; placeholder?: string; inputMode?: 'numeric'; wide?: boolean;
}) {
  const props = { id, value, className: 'cenit-input', placeholder, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined };
  return <div className={`assets-field${wide ? ' assets-wide' : ''}`}>
    <label htmlFor={id}>{label}{optional && <small> (opcional)</small>}</label>
    {textarea ? <textarea {...props} rows={3} onChange={event => onChange(event.target.value)} />
      : <input {...props} list={list} inputMode={inputMode} autoComplete="off" onChange={event => onChange(event.target.value)} />}
    {error ? <p className="assets-error" id={`${id}-error`}>{error}</p> : hint && <p id={`${id}-hint`}>{hint}</p>}
  </div>;
}
export const nullable = (value: string) => value.trim() ? value.trim() : null;
