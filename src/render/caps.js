// Renderer capabilities shared inside the render module + texture crispness helpers.
import * as THREE from 'three';

/** Filled in by installRendering (or lazily the first time a material compiles). */
export const RENDER_CAPS = { maxAnisotropy: 0 };

export function captureCaps(renderer) {
  if (RENDER_CAPS.maxAnisotropy || !renderer?.capabilities) return;
  RENDER_CAPS.maxAnisotropy = Math.max(1, Math.min(16, renderer.capabilities.getMaxAnisotropy() || 1));
}

const MAP_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap',
  'specularMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap', 'sheenColorMap', 'transmissionMap',
];

/**
 * Raise a texture to the maximum anisotropic filtering (only trilinear-mipmapped textures
 * use it). Textures that were already uploaded are re-uploaded once so the new value applies.
 */
export function crispTexture(t) {
  const max = RENDER_CAPS.maxAnisotropy;
  if (!t || !t.isTexture || max <= 1 || t.isRenderTargetTexture || t.anisotropy >= max) return;
  if (t.magFilter === THREE.NearestFilter) return;
  if (t.minFilter !== THREE.LinearMipmapLinearFilter && t.minFilter !== THREE.NearestMipmapLinearFilter) return;
  t.anisotropy = max;
  if (t.version > 0) t.needsUpdate = true;
}

/** Max anisotropy on every texture a material references (standard slots + shader uniforms). */
export function crispMaterialTextures(material) {
  if (!material || RENDER_CAPS.maxAnisotropy <= 1) return;
  for (const k of MAP_SLOTS) if (material[k]) crispTexture(material[k]);
  const u = material.uniforms || material.userData?.uniforms;
  if (u) for (const k in u) if (u[k]?.value?.isTexture) crispTexture(u[k].value);
  if (material.uniforms && material.userData?.uniforms) {
    const u2 = material.userData.uniforms;
    for (const k in u2) if (u2[k]?.value?.isTexture) crispTexture(u2[k].value);
  }
}
