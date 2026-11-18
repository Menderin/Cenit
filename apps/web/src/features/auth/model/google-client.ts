type CredentialResponse = { credential: string };
export type GoogleClient = {
  initialize: (options: { client_id: string; nonce: string; auto_select: false; ux_mode: 'popup'; callback: (response: CredentialResponse) => void }) => void;
  renderButton: (element: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'signin_with' | 'continue_with'; shape: 'rectangular'; locale: 'es'; width: number }) => void;
  cancel: () => void;
  disableAutoSelect: () => void;
};
declare global { interface Window { google?: { accounts: { id: GoogleClient } } } }

let loading: Promise<GoogleClient> | undefined;
export function loadGoogleClient(): Promise<GoogleClient> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleClient>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    const timer = window.setTimeout(fail, 10000);
    function fail() {
      clearTimeout(timer); script.remove(); loading = undefined;
      reject(new Error('No se pudo cargar Google. Reintenta o utiliza tu correo y contraseña.'));
    }
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else fail();
    };
    document.head.append(script);
  });
  return loading;
}
