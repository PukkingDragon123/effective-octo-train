// Loading screen 3D incense. ?p=<progress 0..1>&t=<scene seconds, default 8>&grab=<seconds into the hand sequence>
// beats: the face in the smoke peaks around t=4.1, the shadow passes the candle around t=7.6
import { IncenseScene } from '../ui/IncenseScene.js';

export default async function (ctx) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:50;background:#000';
  const vig = document.createElement('div');
  vig.style.cssText = 'position:fixed;inset:0;z-index:51;pointer-events:none;background:radial-gradient(64% 70% at 56% 50%, transparent 38%, rgba(0,0,0,.9) 100%)';
  document.body.appendChild(vig);
  document.body.appendChild(host);
  const sc = new IncenseScene(host, { manual: true });
  window.__inc = sc;
  const p = Number(ctx.params.get('p') ?? 0.3);
  sc.setProgress(p);
  sc.tip = 0.2985 - p * 0.225 * 0.7;
  const T = Number(ctx.params.get('t') ?? 8);
  for (let i = 0; i < Math.round(T * 30); i++) sc.update(1 / 30);
  window.__incStep = (sec) => {
    for (let i = 0; i < Math.round(sec * 30); i++) sc.update(1 / 30);
  };
  const grab = ctx.params.get('grab');
  if (grab != null) {
    sc._buildHand();
    sc.playGrab();
    const n = Math.round(Number(grab) * 30);
    for (let i = 0; i < n; i++) sc.update(1 / 30);
  }
}
