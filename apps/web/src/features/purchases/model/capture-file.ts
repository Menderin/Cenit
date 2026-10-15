import { EXTRACTION_LIMITS } from '@cenit/contracts/purchases';

export type SelectedCapture = { file: File; url: string; width: number; height: number };
export async function inspectCapture(file: File): Promise<SelectedCapture> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Selecciona una imagen PNG o JPEG.');
  if (!file.size || file.size > EXTRACTION_LIMITS.maxBytes) throw new Error('La imagen debe pesar entre 1 byte y 5 MiB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > EXTRACTION_LIMITS.maxPixels) throw new Error('La imagen supera 20 megapíxeles.');
    return { file, url, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(error instanceof Error && error.message.includes('megapíxeles') ? error.message : 'No se pudo abrir la imagen. Selecciona otro archivo PNG/JPEG.', { cause: error });
  }
}
