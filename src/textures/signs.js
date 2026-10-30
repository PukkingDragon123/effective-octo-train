export const SIGN_KINDS = {};
export function drawSign(kind, opts, canvasTexture) {
  return canvasTexture(64, 64, (g) => { g.fillStyle = '#888'; g.fillRect(0, 0, 64, 64); });
}
