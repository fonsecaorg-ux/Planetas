export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
