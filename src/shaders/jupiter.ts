// Nuvens de Júpiter animadas (shift sutil), apagadas no lado noturno.
export const jupiterCloudVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const jupiterCloudFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uSunPos;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec2 uv = vUv;
    uv.x += uTime * 0.02;
    vec4 c = texture2D(uTexture, uv);
    float lit = smoothstep(-0.05, 0.3, dot(normalize(vWorldNormal), normalize(uSunPos - vWorldPos)));
    gl_FragColor = vec4(c.rgb * lit, c.a * uOpacity * lit);
  }
`;
