import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function noise2d(x: number, y: number, seed = 0): number {
  // hash simples
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2d(x * f, y * f, seed + i * 10);
    a *= 0.5; f *= 2;
  }
  return v;
}

export function proceduralTexture(kind: string, baseColor: string, size = 256): THREE.CanvasTexture {
  const key = `proc:${kind}:${baseColor}`;
  if (cache.has(key)) return cache.get(key) as THREE.CanvasTexture;

  const { canvas, ctx } = makeCanvas(size, size);

  if (kind === 'sun') {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#fff8e0');
    g.addColorStop(0.3, '#ffd27a');
    g.addColorStop(0.7, '#ff9a3c');
    g.addColorStop(1, '#b84a00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // granulação
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      ctx.fillStyle = `rgba(255,220,120,${Math.random() * 0.4})`;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  } else if (kind === 'rocky') {
    // base
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 60, y / 60, 3, 1);
        ctx.fillStyle = `rgba(0,0,0,${0.05 + n * 0.25})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // crateras
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 4 + Math.random() * 14;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (kind === 'earth') {
    // oceano
    ctx.fillStyle = '#1e4d8c';
    ctx.fillRect(0, 0, size, size);
    // continentes via fbm
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 80, y / 80, 4, 2);
        if (n > 0.52) {
          const g = n > 0.62 ? '#3a7d3a' : '#5fa35f';
          ctx.fillStyle = g;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    // gelo nos polos
    ctx.fillStyle = 'rgba(240,248,255,0.7)';
    ctx.fillRect(0, 0, size, size * 0.06);
    ctx.fillRect(0, size * 0.94, size, size * 0.06);
  } else if (kind === 'gas') {
    // bandas horizontais
    for (let y = 0; y < size; y++) {
      const band = Math.sin(y / size * Math.PI * 12) * 0.5 + 0.5;
      const n = fbm(0, y / 40, 3, 3);
      const v = (band * 0.6 + n * 0.4);
      ctx.fillStyle = shade(baseColor, (v - 0.5) * 40);
      ctx.fillRect(0, y, size, 1);
    }
    // turbulência
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 20 + Math.random() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (kind === 'ice') {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / 50, y / 50, 3, 5);
        ctx.fillStyle = `rgba(255,255,255,${n * 0.3})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  } else {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

function shade(hex: string, delta: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + delta));
  g = Math.max(0, Math.min(255, g + delta));
  b = Math.max(0, Math.min(255, b + delta));
  return `rgb(${r},${g},${b})`;
}

// Tenta carregar textura real de /textures/<name>; se falhar, usa procedural.
export async function loadTexture(name: string | undefined, fallbackKind: string, baseColor: string): Promise<THREE.Texture> {
  if (!name) return proceduralTexture(fallbackKind, baseColor);
  try {
    const loader = new THREE.TextureLoader();
    const tex = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(`/textures/${name}`, resolve, undefined, reject);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch {
    return proceduralTexture(fallbackKind, baseColor);
  }
}

export function proceduralClouds(size = 256): THREE.CanvasTexture {
  const key = 'clouds';
  if (cache.has(key)) return cache.get(key) as THREE.CanvasTexture;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 30 + Math.random() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export function proceduralRings(size = 256): THREE.CanvasTexture {
  const key = 'rings';
  if (cache.has(key)) return cache.get(key) as THREE.CanvasTexture;
  const { canvas, ctx } = makeCanvas(size, size);
  // faixas radiais
  const cx = size / 2, cy = size / 2;
  for (let r = 0; r < size / 2; r++) {
    const t = r / (size / 2);
    const band = Math.sin(t * 80) * 0.5 + 0.5;
    const alpha = (t > 0.35 && t < 0.95) ? (0.3 + band * 0.5) : 0;
    ctx.strokeStyle = `rgba(220,200,160,${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
