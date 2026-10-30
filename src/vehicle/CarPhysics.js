// Arcade-realistic rear-wheel-drive 90s sedan: torque curve, 5-speed manual (auto
// clutch) or 4-speed automatic, rev limiter, brakes, handbrake (locks rear), speed
// sensitive steering, kinematic bicycle yaw with grip limit and slides, road corridor
// constraint (shoulder slows, vegetation wall pushes back + scrape), ground following
// on four wheels, suspension pitch/roll/heave springs, bumps, seat weight sag, autopilot.
import * as THREE from 'three';
import { clamp, lerp, damp, noise, smoothstep, wrapAngle } from '../core/math.js';
import { DIM } from './TaxiBody.js';

const G = 9.81;
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _smp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), width: 0 };

export const CAR = {
  mass: 1100,
  wheelbase: DIM.axleR - DIM.axleF,
  track: DIM.track * 2,
  wheelR: DIM.wheelR,
  idle: 820,
  redline: 6200,
  limiter: 6400,
  final: 4.1,
  eff: 0.82,
  manual: { R: -3.4, N: 0, 1: 3.29, 2: 1.9, 3: 1.31, 4: 1.0, 5: 0.82 },
  auto: [2.8, 1.55, 1.0, 0.72],
  autoR: -2.4,
  brakeForce: 9200,
  handbrakeForce: 3600,
  cdA: 0.55,
  roll: 170,
  maxSteer: 0.6,
};

/** Torque (Nm) of a tired 1.5 litre engine. */
export function torqueAt(rpm) {
  const r = rpm / 1000;
  const t = 62 + 46 * Math.sin(clamp((r - 0.6) / 4.2, 0, 1) * Math.PI * 0.62) - Math.max(0, r - 5.0) * 18;
  return Math.max(0, t);
}

export class CarPhysics {
  constructor(taxi) {
    this.taxi = taxi;
    this.pos = new THREE.Vector3(); // ground point under the car centre
    this.yaw = 0;
    this.v = 0; // forward speed m/s (signed)
    this.vLat = 0; // lateral slip velocity (+ right)
    this.yawRate = 0;
    this.wheelAngle = 0;
    this.steerIn = 0;
    this.rpm = CAR.idle;
    this.engineLoad = 0;
    this.autoGear = 1;
    this.clutch = 1;
    this.shiftTimer = 0;
    this.groundPitch = 0;
    this.groundRoll = 0;
    this.groundY = 0;
    this.accLong = 0;
    this.accLat = 0;
    this.wheelSpin = [0, 0, 0, 0];
    this.wheelSteer = 0;
    this.susp = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0 };
    this.seatKg = { driver: 75, frontPassenger: 0, rearLeft: 0, rearRight: 0, rearCenter: 0 };
    this.roadRef = null;
    this.lateral = 0;
    this.surface = 'asphalt';
    this.offRoad = 0;
    this.wallContact = 0;
    this._collideCooldown = 0;
    this.input = { throttle: 0, brake: 0, steer: 0 };
    this.auto = null;
    this.frozen = false;
    this.bumpSeed = Math.random() * 100;
    this.lastBump = 0;
    this.onBump = null; // (strength) => void
    this.onCollision = null; // ({impulse, point}) => void
    this.onShift = null;
  }

  place(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.v = 0;
    this.vLat = 0;
    this.yawRate = 0;
    this.roadRef = null;
    const w = this.taxi.world;
    if (w?.getHeight) this.groundY = this.pos.y = w.getHeight(pos.x, pos.z);
  }

  get forward() {
    return _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  gearRatio(state, transmission) {
    const g = state.gear;
    if (transmission === 'manual') return CAR.manual[g] ?? 0;
    if (g === 'R') return CAR.autoR;
    if (g === 'D') return CAR.auto[this.autoGear - 1];
    if (g === '2') return CAR.auto[Math.min(this.autoGear, 2) - 1];
    if (g === 'L') return CAR.auto[0];
    return 0;
  }

  step(dt, state, transmission) {
    if (this.frozen || dt <= 0) return;
    const inp = this.input;
    const world = this.taxi.world;
    const speed = Math.abs(this.v);
    const kmh = speed * 3.6;

    // ---- steering --------------------------------------------------------------------------
    const maxA = CAR.maxSteer * lerp(1, 0.2, smoothstep(0, 32, speed));
    const target = -inp.steer * maxA;
    const rate = 2.6;
    this.wheelAngle += clamp(target - this.wheelAngle, -rate * dt, rate * dt);
    this.wheelAngle = clamp(this.wheelAngle, -CAR.maxSteer, CAR.maxSteer);

    // ---- drivetrain ------------------------------------------------------------------------
    const engineOn = state.engineOn;
    const ratio = this.gearRatio(state, transmission);
    const total = ratio * CAR.final;
    const wheelRpm = (this.v / CAR.wheelR) * (60 / (2 * Math.PI));
    let throttle = engineOn ? inp.throttle : 0;
    let driveF = 0;
    let targetRpm;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.shiftTimer > 0) throttle *= 0.15;
    if (engineOn && total !== 0) {
      const coupled = Math.abs(wheelRpm * total);
      // auto clutch / torque converter: slip up to a launch rpm
      const launch = transmission === 'manual' ? 1300 + throttle * 1600 : 1000 + throttle * 1500;
      const slipping = coupled < launch;
      targetRpm = slipping ? Math.max(coupled, lerp(CAR.idle, launch, Math.min(1, throttle * 1.4))) : coupled;
      let tq = torqueAt(this.rpm) * throttle;
      if (this.rpm > CAR.limiter) tq = 0;
      // engine braking off throttle
      if (!slipping) tq -= (1 - throttle) * (8 + this.rpm * 0.0045);
      let mult = 1;
      if (slipping && transmission !== 'manual') mult = lerp(1.9, 1, coupled / launch); // converter torque multiplication
      driveF = (tq * mult * total * CAR.eff) / CAR.wheelR;
      // idle creep in auto (D/R) when no brake
      if (transmission !== 'manual' && slipping && throttle < 0.05) driveF += Math.sign(total) * 380 * (1 - Math.min(1, speed / 2.5));
      if (transmission === 'manual' && slipping && throttle < 0.05) driveF += Math.sign(total) * 220 * (1 - Math.min(1, speed / 2));
    } else {
      targetRpm = engineOn ? CAR.idle + throttle * (CAR.redline - CAR.idle) * 0.95 : 0;
    }
    // auto gearbox shifting
    if (transmission !== 'manual' && state.gear === 'D' && engineOn) {
      const up = lerp(2300, 5400, inp.throttle);
      const dn = lerp(1250, 2600, inp.throttle);
      const rpmNow = Math.abs(wheelRpm * CAR.auto[this.autoGear - 1] * CAR.final);
      if (rpmNow > up && this.autoGear < 4) {
        this.autoGear++;
        this.shiftTimer = 0.25;
        this.onShift?.(this.autoGear);
      } else if (rpmNow < dn && this.autoGear > 1) {
        this.autoGear--;
        this.shiftTimer = 0.18;
        this.onShift?.(this.autoGear);
      }
    }
    if (state.gear !== 'D') this.autoGear = 1;
    // engine rpm dynamics
    const rpmRate = targetRpm > this.rpm ? 5200 : 3800;
    this.rpm += clamp(targetRpm - this.rpm, -rpmRate * dt, rpmRate * dt);
    if (!engineOn) this.rpm = Math.max(0, this.rpm - 2600 * dt);
    this.rpm = clamp(this.rpm, 0, CAR.limiter + 150);
    this.engineLoad = damp(this.engineLoad, throttle, 8, dt);

    // handbrake prevents pulling away
    if (state.handbrake && speed < 1.5) driveF *= 0.12;
    if (state.gear === 'P' && transmission !== 'manual') {
      driveF = 0;
      this.v = damp(this.v, 0, 20, dt);
    }

    // ---- longitudinal forces ---------------------------------------------------------------
    const surfaceDrag = this.offRoad * 900 + this.wallContact * 2600;
    const resist = CAR.cdA * 0.6 * this.v * Math.abs(this.v) + Math.sign(this.v) * (CAR.roll + surfaceDrag) * Math.min(1, speed * 2);
    let brakeF = inp.brake * CAR.brakeForce + (state.handbrake ? CAR.handbrakeForce : 0);
    const mass = CAR.mass + this.totalSeatKg();
    let F = driveF - resist;
    const a = F / mass;
    this.v += a * dt;
    // brakes: never reverse the direction
    const dvB = (brakeF / mass) * dt;
    if (Math.abs(this.v) <= dvB) this.v = 0;
    else this.v -= Math.sign(this.v) * dvB;
    this.accLong = damp(this.accLong, (this.v - (this._lastV ?? this.v)) / dt, 10, dt);
    this._lastV = this.v;

    // ---- yaw / lateral --------------------------------------------------------------------
    const grip = (state.handbrake ? 0.45 : 1) * (this.offRoad > 0.5 ? 0.7 : 1) * (0.8 + 0.2 * (1 - (GLOBAL_WET ?? 0)));
    let yawTarget = (this.v * Math.tan(this.wheelAngle)) / CAR.wheelbase;
    const maxYaw = (0.95 * G * grip) / Math.max(speed, 2);
    yawTarget = clamp(yawTarget, -maxYaw, maxYaw);
    const yawK = state.handbrake && speed > 4 ? 2.5 : 9;
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-yawK * dt));
    // handbrake slide kicks the tail
    if (state.handbrake && speed > 6) this.vLat += -this.yawRate * speed * 0.18 * dt;
    this.vLat *= Math.exp(-(state.handbrake ? 1.4 : 6) * dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    this.accLat = damp(this.accLat, this.v * this.yawRate, 8, dt);

    // integrate position
    const fw = this.forward;
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // right vector
    this.pos.addScaledVector(fw, this.v * dt).addScaledVector(_r, this.vLat * dt);

    // ---- road corridor ---------------------------------------------------------------------
    this.offRoad = 0;
    this.wallContact = 0;
    this._collideCooldown = Math.max(0, this._collideCooldown - dt);
    const road = world?.road;
    if (road?.project) {
      const pr = road.project(this.pos, this.roadRef?.id ?? null);
      if (pr) {
        this.roadRef = { id: pr.id, s: pr.s };
        this.lateral = pr.lateral;
        const half = (pr.width ?? 6.2) / 2;
        const shoulder = this.taxi.layout?.shoulder ?? 1.3;
        const lat = Math.abs(pr.lateral);
        const carHalf = 0.86;
        if (lat + carHalf > half) this.offRoad = clamp((lat + carHalf - half) / 0.8, 0, 1);
        const wall = half + shoulder + 1.5 - carHalf;
        if (lat > wall) {
          const pen = lat - wall;
          const sgn = Math.sign(pr.lateral);
          // push back along the road's right vector
          this.pos.addScaledVector(pr.right, -sgn * pen);
          // kill outward velocity, scrape
          const vel = _v.copy(fw).multiplyScalar(this.v).addScaledVector(_r, this.vLat);
          const outward = vel.dot(pr.right) * sgn;
          if (outward > 0) {
            const lossFrac = clamp(outward / Math.max(speed, 0.1), 0, 1);
            this.v *= 1 - 0.55 * lossFrac;
            this.vLat -= outward * sgn * _r.dot(pr.right) * 0.8;
            // steer the heading along the wall a bit
            const tYaw = Math.atan2(-pr.tangent.x, -pr.tangent.z) + (this.v < 0 ? Math.PI : 0);
            this.yaw += wrapAngle(tYaw - this.yaw) * Math.min(1, lossFrac * 0.25);
            if (this._collideCooldown <= 0 && outward > 0.6) {
              this._collideCooldown = 0.6;
              const pt = this.pos.clone().addScaledVector(pr.right, sgn * carHalf).setY(this.groundY + 0.5);
              this.onCollision?.({ impulse: outward * mass, point: pt, speed: outward });
            }
          }
          this.wallContact = clamp(pen * 4 + 0.3, 0, 1);
        }
        this.surface = this.offRoad > 0.3 ? 'gravel' : 'asphalt';
      }
    }

    // ---- ground following ---------------------------------------------------------------------
    this.followGround(dt);

    // ---- bumps (cracks / potholes along the road) ---------------------------------------------
    const sAlong = this.roadRef ? this.roadRef.s : this.pos.x + this.pos.z;
    let bumpH = 0;
    if (speed > 0.5) {
      const n = noise.noise2D(sAlong * 0.9 + this.bumpSeed, this.lateral * 0.5) * 0.5 + noise.noise2D(sAlong * 3.1, 7.7) * 0.25;
      bumpH = n * (0.006 + this.offRoad * 0.02);
      // potholes: deterministic cells along s
      const cell = Math.floor(sAlong / 9);
      const hsh = Math.abs(Math.sin(cell * 127.1 + 311.7) * 43758.5453) % 1;
      if (hsh < 0.12) {
        const at = cell * 9 + 4.5;
        const d = Math.abs(sAlong - at);
        if (d < 0.35 && Math.abs(this.lateral - (hsh * 40 - 2.4)) < 1.2) bumpH -= 0.03 * (1 - d / 0.35);
      }
    }
    const bumpV = (bumpH - (this._lastBumpH ?? bumpH)) / dt;
    this._lastBumpH = bumpH;
    if (Math.abs(bumpV) > 0.25 && speed > 3) {
      this.susp.heaveV += bumpV * 0.35;
      this.susp.pitchV += bumpV * 0.08 * (Math.random() - 0.5);
      if (Math.abs(bumpV) > 0.5) this.onBump?.(clamp(Math.abs(bumpV) * 0.6, 0, 1));
    }
    this.susp.heaveV += bumpV * 0.05;

    // ---- suspension springs -------------------------------------------------------------------
    const sk = this.seatSag();
    const s = this.susp;
    const pitchT = clamp(this.accLong * 0.0065, -0.045, 0.045) + sk.pitch;
    const rollT = clamp(-this.accLat * 0.0085, -0.06, 0.06) + sk.roll;
    const heaveT = sk.heave + this.wallContact * 0;
    const kP = 70, cP = 9, kR = 55, cR = 7, kH = 160, cH = 13;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      s.pitchV += ((pitchT - s.pitch) * kP - s.pitchV * cP) * h;
      s.pitch += s.pitchV * h;
      s.rollV += ((rollT - s.roll) * kR - s.rollV * cR) * h;
      s.roll += s.rollV * h;
      s.heaveV += ((heaveT - s.heave) * kH - s.heaveV * cH) * h;
      s.heave += s.heaveV * h;
    }
    // engine shake at idle
    if (engineOn) {
      const t = performance.now() * 0.001;
      s.roll += Math.sin(t * this.rpm * 0.105) * 0.00025 * (1.2 - Math.min(1, this.rpm / 3000));
    }

    // ---- wheels -------------------------------------------------------------------------------
    const spin = (this.v / CAR.wheelR) * dt;
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      if (rear && state.handbrake) continue;
      this.wheelSpin[i] += spin;
    }
    this.wheelSteer = this.wheelAngle;
  }

  followGround(dt) {
    const world = this.taxi.world;
    if (!world?.getHeight) {
      this.groundY = this.pos.y;
      return;
    }
    const fw = this.forward;
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const hb = CAR.wheelbase / 2, ht = CAR.track / 2;
    const zc = (DIM.axleF + DIM.axleR) / 2;
    const sample = (lz, lx) => {
      _p.copy(this.pos).addScaledVector(fw, -(lz)).addScaledVector(_r, lx);
      return world.getHeight(_p.x, _p.z);
    };
    const fl = sample(DIM.axleF, -ht), fr = sample(DIM.axleF, ht), rl = sample(DIM.axleR, -ht), rr = sample(DIM.axleR, ht);
    void zc;
    void hb;
    const front = (fl + fr) / 2, rear = (rl + rr) / 2, left = (fl + rl) / 2, right = (fr + rr) / 2;
    const y = (front + rear) / 2;
    const pitch = Math.atan2(front - rear, CAR.wheelbase);
    const roll = Math.atan2(right - left, CAR.track);
    const k = 1 - Math.exp(-14 * dt);
    this.groundY = this._gInit ? lerp(this.groundY, y, k) : y;
    this.groundPitch = this._gInit ? lerp(this.groundPitch, pitch, k) : pitch;
    this.groundRoll = this._gInit ? lerp(this.groundRoll, roll, k) : roll;
    this._gInit = true;
    this.pos.y = this.groundY;
  }

  totalSeatKg() {
    let s = 0;
    for (const k in this.seatKg) s += this.seatKg[k];
    return s;
  }

  seatSag() {
    const kg = this.seatKg;
    const pos = { driver: [0.37, 0.22], frontPassenger: [-0.37, 0.22], rearLeft: [-0.4, 1.02], rearRight: [0.4, 1.02], rearCenter: [0, 1.02] };
    let heave = 0, pitch = 0, roll = 0;
    for (const k in kg) {
      const m = kg[k];
      if (!m) continue;
      const [x, z] = pos[k];
      heave -= m * 0.00012;
      roll -= x * m * 0.00028; // weight on the right (+x) rolls the body right (negative z-rot)
      pitch += z * m * 0.00012; // weight at the rear (+z) lifts the nose (positive pitch)
    }
    return { heave, pitch, roll };
  }
}

let GLOBAL_WET = 0;
export function setPhysicsWetness(v) {
  GLOBAL_WET = v;
}
