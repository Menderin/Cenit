import { Link } from 'react-router';
import { AirplaneTiltIcon } from '@phosphor-icons/react/dist/csr/AirplaneTilt';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CalendarCheckIcon } from '@phosphor-icons/react/dist/csr/CalendarCheck';
import commissionTemplate from '../components/commission-template.svg';
import leaveTemplate from '../components/leave-template.svg';
import { TemplateImage } from '../components/TemplateDocument.js';
import { commissionSheet } from '../model/commission-layout.js';
import { leaveSheet } from '../model/leave-layout.js';
import '../personnel.css';

// Entrada de Personal: el administrativo elige qué documento preparar viendo la hoja que se generará.
// Nada se guarda en Cenit.
export function Personnel() {
  return <section className="personnel-page personnel-page--home">
    <div className="personnel-heading">
      <div><h1>Personal</h1><p>Elige el documento, complétalo, revísalo y descárgalo o imprímelo para gestionar las firmas. Cenit no guarda los documentos.</p></div>
    </div>
    <ul className="personnel-documents">
      <li><Link to="comision">
        <span className="personnel-documents__sheet" aria-hidden="true"><span className="personnel-documents__tag">PDF · 1 hoja carta</span><span className="personnel-documents__stack"><TemplateImage template={commissionTemplate} alt="" sheet={commissionSheet} /></span></span>
        <span className="personnel-documents__body">
          <h2><AirplaneTiltIcon size={20} aria-hidden="true" />Comisión de servicios</h2>
          <p>Funcionario, lugar y fechas, financiamiento y actividad o evento.</p>
          <span className="personnel-documents__go">Preparar documento<ArrowRightIcon size={16} aria-hidden="true" /></span>
        </span>
      </Link></li>
      <li><Link to="permiso">
        <span className="personnel-documents__sheet" aria-hidden="true"><span className="personnel-documents__tag">PDF · 1 hoja carta</span><span className="personnel-documents__stack"><TemplateImage template={leaveTemplate} alt="" sheet={leaveSheet} /></span></span>
        <span className="personnel-documents__body">
          <h2><CalendarCheckIcon size={20} aria-hidden="true" />Solicitud de permiso</h2>
          <p>Funcionario, tipo de permiso, fechas y, si es por hora, horario y recuperación.</p>
          <span className="personnel-documents__go">Preparar documento<ArrowRightIcon size={16} aria-hidden="true" /></span>
        </span>
      </Link></li>
    </ul>
  </section>;
}
