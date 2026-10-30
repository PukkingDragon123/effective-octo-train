// Loading screen 3D incense. ?p=<progress 0..1>&grab=<seconds into the hand sequence>
import { IncenseScene } from '../ui/IncenseScene.js';

export default async function (ctx) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#050506';
  document.body.appendChild(host);
  const sc = new IncenseScene(host, { manual: true });
  window.__inc = sc;
  const p = Number(ctx.params.get('p') ?? 0.3);
  sc.setProgress(p);
  sc.tip = 0.2985 - p * 0.225 * 0.7;
  for (let i = 0; i < 240; i++) sc.update(1 / 30);
  const grab = ctx.params.get('grab');
  if (grab != null) {
    sc._buildHand();
    sc.playGrab();
    const n = Math.round(Number(grab) * 30);
    for (let i = 0; i < n; i++) sc.update(1 / 30);
  }
}
