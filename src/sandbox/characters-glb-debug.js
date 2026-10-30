// Minimal GLB character bring-up scene: template loading, orientation, clip retargeting.
//   ?clip=<UAL clip>  &sex=m|f  &cam=front|side|close  &uv=1 (UV grid texture)
import * as THREE from 'three';
import { skinMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { loadTemplates, templateFor } from '../characters/glb/assets.js';
import { InstanceRig } from '../characters/glb/rig.js';

export default async function ({ engine, cameraRig, params }) {
  await loadTemplates();
  const scene = engine.scene;
  scene.background = new THREE.Color(0x3a3d40);
  GLOBAL_UNIFORMS.uFogDensity.value = 0.0;
  const key = new THREE.DirectionalLight(0xfff2e0, 2.0);
  key.position.set(-2, 3, 3);
  scene.add(key, new THREE.AmbientLight(0x808890, 0.8));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  scene.add(ground);
  // uv grid
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = '#c69472'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i <= 32; i++) {
    g.fillStyle = i % 4 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.7)';
    g.fillRect(i * 32 - 1, 0, 2, 1024); g.fillRect(0, i * 32 - 1, 1024, 2);
  }
  // face region marks: eyes at (0.36,0.44)/(0.64,0.44) of region (0,400,320,320)
  for (const s of [0.36, 0.64]) { g.fillStyle = '#2040ff'; g.beginPath(); g.arc(5 + s * 310, 405 + 0.44 * 310, 6, 0, 7); g.fill(); }
  g.fillStyle = '#ff2020'; for (let t = 0.6; t < 0.9; t += 0.02) g.fillRect(5 + 0.5 * 310 - 30, 405 + t * 310, 60, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  const clipsP = params.get('clips');
  const sexes = clipsP ? clipsP.split(',').map(() => params.get('sex') || 'm') : (params.get('sex') || 'm,f').split(',');
  const chars = [];
  sexes.forEach((sex, k) => {
    const clipName = clipsP ? clipsP.split(',')[k] : params.get('clip') || 'Idle_Loop';
    const t = templateFor(sex);
    const rig = new InstanceRig(t);
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI; // glTF characters face +Z; ours face -Z
    root.add(inner);
    for (const b of rig.roots) inner.add(b);
    const mat = skinMaterial({ map: params.get('uv') === '1' ? tex : null, color: 0xc69472, roughness: 0.7 });
    const mesh = new THREE.SkinnedMesh(t.geos.body_hi, mat);
    mesh.bind(rig.skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;
    inner.add(mesh);
    root.position.x = (k - (sexes.length - 1) / 2) * (clipsP ? 1.1 : 0.9);
    root.rotation.y = Math.PI; // face the camera (+Z)
    scene.add(root);
    const mixer = new THREE.AnimationMixer(inner);
    const clip = t.clips.get(clipName);
    if (clip) mixer.clipAction(clip).play();
    chars.push({ rig, mixer, root });
  });
  engine.onUpdate((dt) => {
    for (const c of chars) { c.rig.restoreBase(); c.mixer.update(dt); c.rig.saveBase(); }
  }, 20);
  const eye = new THREE.Object3D();
  scene.add(eye);
  const cam = params.get('cam') || 'front';
  const W = sexes.length * 0.55 + 1.2;
  const C = { front: [[0, 1.0, 3.6 * Math.max(1, W / 2.4)], [0, 0.95, 0]], three: [[W * 0.9, 1.6, W * 1.3], [0, 0.8, 0]], side: [[3.6, 1.0, 0], [0, 0.95, 0]], close: [[0.45, 1.68, 0.55], [0.45, 1.66, 0]], back: [[0, 1.0, -3.6], [0, 0.95, 0]] }[cam];
  eye.position.fromArray(C[0]);
  const dir = new THREE.Vector3().fromArray(C[1]).sub(eye.position).normalize();
  cameraRig.attach(eye, null, { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(dir.y) });
  cameraRig.lookEnabled = false;
  if (cam === 'close') cameraRig.fovOffset = -35;
  console.log('[glb] clips', [...templateFor('m').clips.keys()].join(','), 'tris', templateFor('m').geos.body_hi.index.count / 3);
}
