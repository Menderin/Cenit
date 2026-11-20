import { useState } from 'react';

export function ProfileAvatar({ name, pictureUrl, className, decorative = false }: {
  name: string; pictureUrl?: string | null; className: string; decorative?: boolean;
}) {
  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  return <span className={className} aria-hidden={decorative || undefined}>
    {pictureUrl && pictureUrl !== failedPicture
      ? <img src={pictureUrl} alt={decorative ? '' : `Foto de perfil de ${name}`} referrerPolicy="no-referrer" onError={() => setFailedPicture(pictureUrl)} />
      : <span aria-label={decorative ? undefined : 'Avatar con inicial'}>{name.trim().charAt(0).toUpperCase()}</span>}
  </span>;
}
