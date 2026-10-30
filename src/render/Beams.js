// Soft volumetric light cones (headlights, streetlights, torches).
// A cone shell drawn additively; brightness follows the view-angle "thickness", falls off
// along the beam, drifts with dust/mist noise and scales with the current fog density.
import * as THREE from 'three';
import { injectGlobals } from './uniforms.js';

const BEAM_VERT = /* glsl */ `
uniform float uLength;
varying vec3 vWP;
varying vec3 vN;
varying float vAxial;
varying vec3 vAxisW;
varying vec3 vApexW;
void main() {
  vAxial = clamp(-position.z / uLength, 0.0, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vAxisW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, -1.0));
  vApexW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = /* glsl */ `
#include <dlb_common>
#include <dlb_globals>
#include <dlb_fog_common>
uniform vec3 uColor;
uniform float uIntensity;
uniform float uLength;
uniform float uNoise;
uniform float uCosHalf;
uniform float uGroundY;
varying vec3 vWP;
varying vec3 vN;
varying float vAxial;
varying vec3 vAxisW;
varying vec3 vApexW;
void main() {
  vec3 V = normalize(cameraPosition - vWP);
  float ndv = abs(dot(normalize(vN), V));
  // thickness: bright where the view ray crosses the beam core, soft at the silhouette
  float soft = pow(ndv, 2.4) * 0.5;
  // camera inside / looking down the beam: boost (we see along the axis)
  float along = abs(dot(V, vAxisW));
  soft = mix(soft, 0.5, smoothstep(0.8, 1.0, along) * 0.3);
  // soften where the cone meets the ground (no depth buffer here)
  soft *= smoothstep(uGroundY, uGroundY + 0.9, vWP.y);
  float ax = vAxial;
  float fall = smoothstep(0.0, 0.06, ax) * (1.0 - smoothstep(0.45, 1.0, ax)) / (1.0 + ax * ax * 6.0);
  vec3 drift = vec3(dlbWindDir.x, 0.15, dlbWindDir.y) * dlbTime * (0.25 + dlbWindStrength);
  float n = dlbFogNoise3(vWP * 0.9 - drift) * 0.6 + dlbFogNoise3(vWP * 2.3 + drift * 1.7) * 0.4;
  float dust = mix(1.0, 0.35 + n * 1.3, uNoise);
  float fogK = 0.15 + dlbFogDensity * 14.0 + dlbFogHeightDensity * 1.5;
  float T = dlbFogTransmittance(vWP);
  vec3 c = uColor * uIntensity * soft * fall * dust * fogK * T;
  gl_FragColor = vec4(c, 1.0);
}
`;

const _geoCache = new Map();
function coneGeometry(length, angle) {
  const key = length.toFixed(2) + '|' + angle.toFixed(3);
  if (_geoCache.has(key)) return _geoCache.get(key);
  const r = Math.tan(angle) * length;
  const g = new THREE.CylinderGeometry(0.03, r, length, 32, 8, true);
  g.translate(0, -length / 2, 0); // apex (narrow end) at origin, extends along -Y
  g.rotateX(Math.PI / 2); // -Y -> -Z
  g.computeBoundingSphere();
  _geoCache.set(key, g);
  return g;
}

/**
 * Soft volumetric light cone. The apex is at the mesh origin and the beam points along
 * local -Z (rotate it like a spotlight; rotation.x = -PI/2 points it straight down).
 * opts { color=0xfff1d0, length=12, angle=0.45 (half-angle, radians), intensity=1, noise=0.8,
 *   groundY (world Y where the cone fades out instead of cutting hard into the ground) }
 * Returns a Mesh; tweak `mesh.userData.uniforms.uIntensity.value` / `.uColor.value`,
 * or call `mesh.userData.setIntensity(v)`.
 */
export function createVolumetricBeam(opts = {}) {
  const length = opts.length ?? 12;
  const angle = opts.angle ?? 0.45;
  const uniforms = injectGlobals({
    uColor: { value: new THREE.Color(opts.color ?? 0xfff1d0) },
    uIntensity: { value: opts.intensity ?? 1 },
    uLength: { value: length },
    uNoise: { value: opts.noise ?? 0.8 },
    uCosHalf: { value: Math.cos(angle) },
    uGroundY: { value: opts.groundY ?? -1e4 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(coneGeometry(length, angle), mat);
  mesh.name = 'volumetricBeam';
  mesh.renderOrder = 10;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.uniforms = uniforms;
  mesh.userData.setIntensity = (v) => (uniforms.uIntensity.value = v);
  mesh.userData.setColor = (c) => uniforms.uColor.value.set(c);
  mesh.userData.setGroundY = (y) => (uniforms.uGroundY.value = y);
  return mesh;
}
