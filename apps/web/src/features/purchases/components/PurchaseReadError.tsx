import { Link } from 'react-router';
import { HttpError } from '../../../shared/lib/http.js';

export function PurchaseReadError({ error, returnTo, onRetry }: { error: Error; returnTo: string; onRetry: () => void }) {
  const status = error instanceof HttpError ? error.status : undefined;
  const permanent = status === 400 || status === 404;
  const message = status === 400 ? 'El enlace de esta compra no es válido.' : status === 404 ? 'No encontramos esta compra.' : error.message;
  return <div className="purchase-state" role="alert">
    <p>{message}</p>
    {permanent ? <Link className="cenit-button" to={returnTo}>Volver al registro</Link>
      : <button className="cenit-button" type="button" onClick={onRetry}>Reintentar</button>}
  </div>;
}
