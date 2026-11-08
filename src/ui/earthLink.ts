/**
 * Botão "Ver a Terra de perto" — abre o Google Earth Web centrado em coordenadas
 * pré-definidas. Se houver sessão WebXR ativa, encerra antes de abrir o link
 * (iframe/nova aba não renderiza dentro do headset).
 */

// Coordenadas padrão: Praia Grande / Cubatão — SP
const DEFAULT_LAT = -23.9735;
const DEFAULT_LNG = -46.3058;
const DEFAULT_ALT = 5000; // altitude em metros

export interface EarthLinkOptions {
  lat?: number;
  lng?: number;
  alt?: number;
  xrRenderer?: { xr: { getSession: () => XRSession | null } };
}

export function addEarthLink(container: HTMLElement, opts: EarthLinkOptions = {}) {
  const lat = opts.lat ?? DEFAULT_LAT;
  const lng = opts.lng ?? DEFAULT_LNG;
  const alt = opts.alt ?? DEFAULT_ALT;
  const url = `https://earth.google.com/web/@${lat},${lng},${alt}a,5000d,35y,0h,45t,0r`;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.style.cssText = 'margin-top:8px;width:100%;background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);';
  btn.innerHTML = '🌍 Ver a Terra de perto';

  btn.addEventListener('click', () => {
    // window.open deve ser chamado de forma síncrona dentro do handler de clique
    // para o navegador reconhecer o gesto do usuário e não bloquear como pop-up.
    // A sessão XR é encerrada em paralelo, sem bloquear a abertura da aba.
    // Testado no Chrome mobile: abertura ocorre sem bloqueio mesmo com sessão VR ativa.
    window.open(url, '_blank', 'noopener,noreferrer');
    const session = opts.xrRenderer?.xr?.getSession?.();
    if (session) {
      session.end().catch(() => { /* sessão já encerrada */ });
    }
  });

  container.appendChild(btn);
  return btn;
}
