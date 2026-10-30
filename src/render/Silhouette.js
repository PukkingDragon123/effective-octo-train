// Painted 2D silhouette flats (tree lines, distant canopy layers, hills) placed in the
// fog like stage-set flats. Unlit apart from a little ambient / moon / headlight / lamp
// light, and fogged more strongly than their real distance (`fogScale`) so successive
// layers separate into paler planes of mist.
import * as THREE from 'three';

/**
 * silhouetteMaterial(opts) -> MeshBasicMaterial (fog-aware, alpha-tested with alpha-to-coverage).
 * opts: { color=0x363a3e (painted albedo x map; lit only by ambient / moon / beams), map, alphaMap, alphaTest=0.5,
 *   fogScale=1 (>1 = fogged as if further away; 1.5–3 for far layers), light=1 (how much
 *   ambient / moon / headlight / lamp light it catches), headlight=1, sway=0 (top edge sways in
 *   the wind; uv.y = 1 at the top), side=DoubleSide, opacity=1, transparent=false, name }
 * `mesh.material.userData.uniforms` exposes dlbSil (x fogScale, y light, z sway, w headlight).
 */
export function silhouetteMaterial(opts = {}) {
  const m = new THREE.MeshBasicMaterial({
    color: opts.color ?? 0x363a3e,
    map: opts.map ?? null,
    alphaMap: opts.alphaMap ?? null,
    alphaTest: opts.alphaTest ?? 0.5,
    side: opts.side ?? THREE.DoubleSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    fog: true,
  });
  m.alphaToCoverage = !opts.transparent && m.alphaTest > 0;
  if (opts.depthWrite !== undefined) m.depthWrite = opts.depthWrite;
  if (opts.name) m.name = opts.name;
  const uniforms = {
    dlbSil: { value: new THREE.Vector4(opts.fogScale ?? 1, opts.light ?? 1, opts.sway ?? 0, opts.headlight ?? 1) },
  };
  m.userData.uniforms = uniforms;
  m.userData.silhouette = { ...opts };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n#include <dlb_common>\n#include <dlb_globals>\nuniform vec4 dlbSil;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
  if (dlbSil.z > 0.0) {
    float top = clamp(uv.y, 0.0, 1.0);
    float ph = position.x * 0.13 + position.z * 0.11;
    transformed.x += (sin(dlbTime * 0.7 + ph) * 0.6 + sin(dlbTime * 1.9 + ph * 3.0) * 0.25) * top * top * dlbSil.z * (0.3 + dlbWindStrength);
  }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 dlbSil;')
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n#ifdef USE_FOG\n#include <dlb_headlight>\n#endif')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `#ifdef USE_FOG
  {
    // dim painted light: sky ambient + moon, the headlight beam and nearby lamps
    vec3 wp = vDlbFogWP;
    vec3 lit = dlbAmbient * 1.4 + dlbMoonScatter * 2.0 + dlbSunScatter * 1.5;
    lit += dlbHeadlightColor * dlbHeadlightAt(wp) * 26.0 * dlbSil.w + dlbLampLightAt(wp) * 0.6;
    outgoingLight *= lit * dlbSil.y;
  }
#endif
#include <opaque_fragment>`,
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `#ifdef USE_FOG
  gl_FragColor.rgb = dlbApplyFog( gl_FragColor.rgb, cameraPosition + ( vDlbFogWP - cameraPosition ) * dlbSil.x, gl_FragCoord.xy );
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'dlbSilhouette';
  return m;
}
