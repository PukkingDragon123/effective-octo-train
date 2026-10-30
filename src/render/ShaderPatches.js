// Cost patches for three's built-in lighting chunk (installed with the fog chunks, before
// any material compiles). They never change the image: every skipped term would have
// been multiplied by a zero light colour.
//  * point / spot / directional lights: the BRDF (RE_Direct) is evaluated only where the
//    light actually reaches (point/spot beyond their range or outside the cone, the dark
//    sun at night, pooled lights that are fading or parked at zero intensity);
//  * directional shadows: the 16-tap PCF lookup is skipped while that light is dark
//    (the sun's shadow map at night costs nothing per pixel).
import * as THREE from 'three';

const RE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const RE_GATED = 'if ( directLight.visible && directLight.color != vec3( 0.0 ) ) ' + RE;
const DIR_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]';
const DIR_SHADOW_GATED = 'directLight.color *= ( directLight.visible && receiveShadow && directLight.color != vec3( 0.0 ) ) ? getShadow( directionalShadowMap[ i ]';

let _installed = false;
export function installLightingPatches() {
  if (_installed) return;
  _installed = true;
  const SC = THREE.ShaderChunk;
  let src = SC.lights_fragment_begin;
  if (!src.includes(RE) || !src.includes(DIR_SHADOW)) {
    console.warn('[render] lights_fragment_begin changed; light gating disabled');
    return;
  }
  src = src.split(RE).join(RE_GATED);
  src = src.replace(DIR_SHADOW, DIR_SHADOW_GATED);
  SC.lights_fragment_begin = src;
}
