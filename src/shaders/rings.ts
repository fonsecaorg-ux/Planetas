// Anéis com transparência baseada em densidade radial. Raio interno e externo
// vêm do corpo: com valores fixos, todo pixel caía fora da faixa e era descartado.
export const ringsVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ringsFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uInner;
  uniform float uOuter;
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vec4 tex = texture2D(uTexture, vUv);
    // densidade radial: mais opaco no meio, transparente nas bordas
    float r = length(vPosition.xy);
    float t = (r - uInner) / (uOuter - uInner);
    float density = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.85, 1.0, t));
    float alpha = tex.a * density * uOpacity;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(tex.rgb, alpha);
  }
`;
