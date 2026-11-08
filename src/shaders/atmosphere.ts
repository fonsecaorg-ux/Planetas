/**
 * Atmosfera com scattering Rayleigh/Mie simplificado.
 *
 * Melhoria sobre a versão Fresnel pura (Fase 1):
 *   - Rayleigh: dispersão proporcional a 1/λ⁴ → halo azul no limbo
 *   - Mie: dispersão uniforme → coroa branco-acinzentada nas nuvens/aerossóis
 *   - Sun-angle: ilumina apenas o lado diurno (igual à versão anterior)
 *   - Fase-de-pôr-do-sol: vermelho/laranja perto do horizonte solar
 *
 * Sem loops de ray-marching (muito caro para mobile VR).
 * Aproximação de um único passo: suficiente para o halo visual.
 */

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
  uniform vec3  uColor;       // cor base da atmosfera (azul para Terra)
  uniform float uIntensity;   // intensidade geral
  uniform vec3  uSunPos;      // posição do Sol em coordenadas de mundo

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  // Comprimentos de onda RGB normalizados para Rayleigh (λ⁻⁴)
  // λ: R=0.70µm, G=0.546µm, B=0.435µm  → normalizados em relação ao G
  const vec3 RAYLEIGH_K = vec3(0.46, 1.0, 2.49);

  void main() {
    vec3 n       = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 sunDir  = normalize(uSunPos - vWorldPos);

    // Fator Fresnel: intensidade máxima na borda do disco (limbo)
    // abs() porque BackSide inverte a normal visível
    float rim = 1.0 - abs(dot(viewDir, n));
    float fresnel = pow(clamp(rim, 0.0, 1.0), 2.5);

    // Iluminação solar: somente lado diurno (evita brilho do lado noturno)
    float sun = max(dot(n, sunDir), 0.0);
    float dayFactor = 0.05 + 0.95 * sun;

    // Pôr do sol / nascer do sol: ângulo raso em relação ao Sol
    // quanto mais raso (sunDir ⊥ n), mais vermelho
    float sunAngle = dot(sunDir, viewDir);
    float sunset = pow(max(sunAngle, 0.0), 8.0); // feixe estreito

    // Rayleigh: cor espectral dependente do comprimento de onda
    // mistura entre a cor azul base e a dispersão por λ⁻⁴
    vec3 rayleigh = uColor * RAYLEIGH_K;
    rayleigh = normalize(rayleigh) * length(uColor); // renormaliza

    // Cor final: Rayleigh dominante + laranja no pôr do sol + branco Mie no centro
    vec3 sunsetColor = vec3(1.0, 0.45, 0.1); // laranja/vermelho
    vec3 mieColor    = vec3(1.0, 0.98, 0.95); // branco levemente quente

    vec3 color = mix(rayleigh, sunsetColor, sunset * 0.6);
    color = mix(color, mieColor, (1.0 - rim) * 0.15); // leve brilho central

    float alpha = fresnel * uIntensity * dayFactor;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;
