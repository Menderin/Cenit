import {
  assetAltaEntries, assetAltaForm, assetDeliveryEntries, assetDeliveryForm, assetLoanEntries, assetLoanForm,
  type AssetDetail, type Delivery, type Loan,
} from '@cenit/contracts/assets';
import type { FormEntry, FormLayout } from '@cenit/contracts';
import { ApiError } from '../../../infrastructure/errors.js';
import { fillForm } from '../../../infrastructure/forms.js';

// Documentos de Bienes sobre la copia exacta de los formularios recibidos (alta de la Sección Registro, entrega y
// préstamo), sin los datos del ejemplo. Firmas vacías y marca «BORRADOR».
const template = (name: string) => new URL(`../../../../assets/${name}`, import.meta.url);
const templates = { alta: template('asset-alta-template.pdf'), delivery: template('asset-delivery-template.pdf'), loan: template('asset-loan-template.pdf') };

async function fill<Cell extends string>(file: URL, layout: FormLayout<Cell>, entries: FormEntry<Cell>[]) {
  const { bytes, fields } = await fillForm(file, layout, entries);
  if (bytes) return bytes;
  const problems = Object.entries(fields);
  const symbol = problems.find(([, message]) => message.includes('«'));
  if (symbol) throw new ApiError(422, 'VALIDATION_ERROR', `${symbol[0]}: ${symbol[1]} Reemplázalo y vuelve a intentar.`);
  throw new ApiError(422, 'DOCUMENT_TOO_LONG', `No cabe en el formulario: ${problems.map(([field]) => field.toLocaleLowerCase('es')).join(', ')}. Acorta ese texto y vuelve a descargar.`);
}

export const altaPdf = (asset: AssetDetail) => fill(templates.alta, assetAltaForm, assetAltaEntries(asset));
export const deliveryPdf = (delivery: Delivery) => fill(templates.delivery, assetDeliveryForm, assetDeliveryEntries(delivery));
export const loanPdf = (loan: Loan) => fill(templates.loan, assetLoanForm, assetLoanEntries(loan));
