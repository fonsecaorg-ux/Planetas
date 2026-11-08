// Atmosfera com glow (Fresnel) para Terra e Vênus. Tudo em coordenadas de
// mundo: o brilho acompanha o lado iluminado, não a posição da câmera.
export const atmosphereVertex = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform vec3 uSunPos;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // BackSide desenha a face de trás da casca, mas o atributo normal continua
    // apontando para fora — abs() dá o mesmo Fresnel dos dois lados
    float fresnel = pow(1.0 - abs(dot(viewDir, n)), 3.0);
    float sun = max(dot(n, normalize(uSunPos - vWorldPos)), 0.0);
    float alpha = fresnel * uIntensity * (0.05 + 0.95 * sun);
    gl_FragColor = vec4(uColor, alpha);
  }
`;
