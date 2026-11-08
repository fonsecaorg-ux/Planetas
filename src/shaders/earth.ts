// Terra com dia/noite. Normal e direção do Sol em coordenadas de mundo: se
// uma estiver em coordenadas de câmera, o terminador gira junto com a câmera.
export const earthVertex = /* glsl */ `
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

export const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform vec3 uSunPos;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 sunDir = normalize(uSunPos - vWorldPos);
    float sun = dot(n, sunDir);
    vec3 day = texture2D(uDay, vUv).rgb * max(sun, 0.0);
    vec3 night = texture2D(uNight, vUv).rgb * 1.6;
    vec3 clouds = texture2D(uClouds, vUv).rgb;
    float blend = smoothstep(-0.1, 0.2, sun);
    vec3 color = mix(night, day, blend);
    // nuvens iluminadas
    color = mix(color, vec3(1.0) * max(sun, 0.0), clouds.r * 0.35 * blend);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
