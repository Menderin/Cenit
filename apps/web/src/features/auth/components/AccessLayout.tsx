import type { ReactNode } from 'react';
import topography from '../../../assets/coquimbo-topografia.webp';
import famedLogo from '../../../assets/logo-famed.webp';
import eicLogo from '../../../assets/logo-eic.webp';
import '../access.css';

export function AccessLayout({ children }: { children: ReactNode }) {
  return <main className="cenit-access">
    <div className="cenit-access__shell">
      <span className="cenit-access__badge">En desarrollo</span>
      <div className="cenit-access__landscape" aria-hidden="true">
        <img className="cenit-access__topography" src={topography} alt="" draggable="false" />
      </div>
      <span className="cenit-access__location">Coquimbo, Chile</span>
      <section className="cenit-access__access" aria-labelledby="access-title">
        <div className="cenit-access__content cenit-page-enter">
          <p className="cenit-access__brand">Cenit</p>
          {children}
          <footer className="cenit-access__institution" aria-label="Instituciones">
            <img src={famedLogo} alt="Facultad de Medicina de la Universidad Católica del Norte" width={64} height={64} />
            <img src={eicLogo} alt="Escuela de Ingeniería UCN Coquimbo" width={131} height={56} />
          </footer>
        </div>
      </section>
    </div>
  </main>;
}
