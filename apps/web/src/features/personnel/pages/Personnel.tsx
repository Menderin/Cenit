import { Link } from 'react-router';
import { AirplaneTiltIcon } from '@phosphor-icons/react/dist/csr/AirplaneTilt';
import { CalendarCheckIcon } from '@phosphor-icons/react/dist/csr/CalendarCheck';
import '../personnel.css';

// Entrada de Personal: el administrativo elige qué documento preparar. Nada se guarda en Cenit.
export function Personnel() {
  return <section className="personnel-page">
    <div className="personnel-heading">
      <div><h1>Personal</h1><p>Prepara el documento, revísalo y descárgalo o imprímelo para gestionar las firmas. Cenit no guarda los documentos.</p></div>
    </div>
    <ul className="personnel-documents">
      <li><Link to="comision">
        <h2><AirplaneTiltIcon size={18} aria-hidden="true" />Comisión de servicios</h2>
        <p>Funcionario, lugar y fechas, financiamiento y actividad o evento.</p>
        <small>Propuesta pendiente de validación</small>
      </Link></li>
      <li><Link to="permiso">
        <h2><CalendarCheckIcon size={18} aria-hidden="true" />Solicitud de permiso</h2>
        <p>Funcionario, tipo de permiso, fechas y, si es por hora, horario y recuperación.</p>
        <small>Propuesta pendiente de validación</small>
      </Link></li>
    </ul>
  </section>;
}
