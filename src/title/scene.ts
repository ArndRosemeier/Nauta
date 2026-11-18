/**
 * The title's picture (plan N7.7): a brig under sail at sunset, the sun's glitter on the swell, her reflection broken by
 * it, clouds lit from below, stars as the light goes, gulls; a finger moves the sun (and with it the time of day), a tap
 * on her fires a gun and the brig hull down on the horizon answers. Drawn with a plain 2D canvas, nothing to compile
 * and nothing to download, in a worker where the browser offers one (titleWorker.ts), so it runs smoothly while the
 * page builds the game's shaders; on the page itself where it does not (title.ts).
 *
 * The colours and places are titleLook.ts's; this file only draws.
 */
import { hash2f, hash3f } from '@futuremagic/core';
import { MS_PER_SECOND } from '../sim/units';
import { BRIG, EXCHANGE, TITLE_LAYOUT, TITLE_SEED, brigPlace, css, exchange, mix, paletteAt, type Exchange, type Palette, type Rgb } from './titleLook';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** How the picture is drawn: counts and sizes as shares of the screen (heights unless said), times in s. */
const SCENE = {
  /** The sky and sea behind everything are drawn at this share of the resolution (they are soft) and scaled up. */
  backdrop: 0.5,
  /** The sun's disc, its halo (× the disc) and its glow's reach; how bright the glow is. */
  sunRadius: 0.019, halo: 3.4, glow: 0.62, glowStrength: 0.85,
  /** Stars: how many, how far down the sky they reach (share of the horizon's depth), how fast they twinkle (rad/s). */
  stars: 170, starDepth: 0.85, twinkle: 1.9, starSize: 1.6,
  /** Clouds: [across (share of width), height, width (share of width), thickness, drift (share of width per s)]. */
  clouds: [[0.18, 0.36, 0.42, 0.028, 0.0035], [0.62, 0.3, 0.55, 0.022, 0.0025], [0.9, 0.44, 0.3, 0.018, 0.0045], [0.35, 0.5, 0.5, 0.012, 0.006], [0.75, 0.54, 0.4, 0.009, 0.007]],
  cloudPuffs: 7, cloudShade: 0.25, cloudFlat: 0.32, cloudStretch: 3, cloudAlpha: 0.55, cloudWrap: 1.4,
  /** The sun's light on the sea: the soft column under it (width, share of the width) and how bright. */
  column: 0.05, columnStrength: 0.4,
  /** The haze along the horizon: its half depth and opacity. */
  haze: 0.035, hazeStrength: 0.55,
  /** The glitter: rows from the horizon down, glints in a row, the path's half width far and near (shares of the width). */
  glitterRows: 80, glints: 16, spreadFar: 0.03, spreadNear: 0.3,
  /** A glint's length far and near (shares of the width), its thickness far and near, how fast glints flash (rad/s). */
  glintFar: 0.004, glintNear: 0.035, thickFar: 0.001, thickNear: 0.0032, sparkle: 1.6, sparkleMore: 3.2, sparkleSharp: 6,
  /** The swell's lines: rows, points across, height near (share of the height), length far and near (shares of the width). */
  waveRows: 30, waveSteps: 44, waveHeight: 0.007, waveFar: 0.025, waveNear: 0.24,
  /** How fast the water runs past her, aft (share of the width per s), and the lines' opacity far and near. */
  flow: 0.018, waveAlphaFar: 0.06, waveAlphaNear: 0.22,
  /** Her reflection: strips, how far each sways (share of the width), how strong at the top. */
  strips: 16, sway: 0.006, reflection: 0.3,
  /** How lit her sails are by the low sun behind them, and how much more as it climbs; the rim light's strength. */
  sailLight: 0.3, sailClimb: 0.45, sailShade: 0.6, rim: 0.8,
  /** Her bow wave and the wash at her stern: opacity, and the water lapping along her waterline (height, share of her length). */
  foam: 0.4, surge: 0.25, lap: 0.012, lapWaves: 9,
  /** Lines of her rigging, px at full size; a spar's thickness, px. */
  line: 0.8, lineAlpha: 0.75, spar: 2.2,
  /** How much of the low sun's glow her chequer band takes. */
  band: 0.25,
  /** Gulls: [across, height, speed (share of the width per s), size, phase]. */
  gulls: [[0.2, 0.22, 0.012, 0.012, 0], [0.27, 0.26, 0.011, 0.009, 1.7], [0.55, 0.18, 0.009, 0.007, 3.1]],
  gullFlap: 4.2, gullWrap: 1.3, gullBob: 0.008,
  /** The muzzle flash: how long, how big (share of her length), the sky's flash with it. */
  flash: 0.22, flashSize: 0.22, skyFlash: 0.08,
  /** Smoke: puffs a gun, how long they last, how far they burst out and grow (shares of her length), drift and rise. */
  puffs: 14, smokeLife: 9, burst: 0.4, burstTime: 0.5, puffSize: 0.1, puffGrow: 0.07, smokeDrift: 0.012, smokeRise: 0.005, smokeAlpha: 0.9,
  /** Splashes: how long they stand, their size far and near (shares of the height), their height (× size). */
  splash: 1.5, splashFar: 0.004, splashNear: 0.06, splashRise: 4,
  /** The sun's rays across the sky: how many, how wide (rad), how bright, how fast they turn (rad/s), how far they reach. */
  rays: 14, rayWidth: 0.06, rayStrength: 0.035, raySpin: 0.012, rayReach: 1.3,
  /** The cloths of a sail, seen as the light comes through its seams: how far apart (her units) and how strong. */
  cloth: 0.024, seam: 0.16,
  /** The vignette: how dark the corners. */
  vignette: 0.5,
  /** The other brig's flash and smoke, as shares of her length. */
  foeFlash: 0.6, foePuff: 2.5,
} as const;

/** A mast in the brig's units (titleLook.ts BRIG). */
interface Mast { x: number; rake: number; heads: readonly number[] }

/** One exchange of fire in flight: when it started (scene time, s) and what it is. */
interface Firing { start: number; plan: Exchange; n: number }

/** A brig's pose on the screen: where her waterline's middle is, her length, her pitch, and which way she faces. */
interface Pose { x: number; y: number; length: number; pitch: number; facing: 1 | -1 }

/** The greys smoke is made of before the light colours it. */
const SMOKE_GREY: Rgb = [150, 150, 156];
/** A muzzle flash's colour at its heart. */
const FLASH: Rgb = [255, 236, 190];
/** A splash's water, before the light colours it. */
const SPRAY: Rgb = [230, 236, 240];
/** A frame may come this share of its interval early and still be drawn. */
const PACE_SLACK = 0.8;
/** A full turn, rad. */
const TURN = Math.PI * 2;

/** The seeded numbers of the picture: the `i`th star, cloud, row of the swell, glint or ray, its `what`. */
const r3 = (i: number, what: number, kind: number) => hash3f(TITLE_SEED, i, what, kind);
/** The kinds of things seeded numbers are drawn for, and what of them: a star's place, twinkle and brightness, a glint's. */
const KIND = { star: 0, cloud: 1, wave: 2, glint: 3, ray: 4 } as const;
const STAR = { x: 0, y: 1, twinkle: 2, phase: 3, bright: 4, size: 5 } as const;
const GLINT = { off: 0, more: 1, phase: 2 } as const;
/** Where the colours of the gradients change: the sky's middle and low colours, the glow's and halo's and flash's hearts. */
const STOP = { skyMid: 1 / 3, skyLow: 0.85, glow: 1 / 4, halo: 1 / 3, flash: 1 / 3 } as const;
/** Starlight. */
const WHITE: Rgb = [255, 255, 255];
/** Her units' box above the waterline, which her hull and sails are clipped to: from, width and height. */
const ABOVE_WATER = { from: -2, width: 4, height: 2 } as const;

/** Lets through at most `fps` frames a second of a faster frame clock (a 120 Hz screen, or a check's few). */
export class FramePace {
  private next = -Infinity;
  constructor(private readonly fps: number) {}
  /** Whether the frame at `now` (ms) is drawn. */
  due(now: number): boolean {
    if (now < this.next) return false;
    // A little early still counts: a 60 Hz frame clock's ticks wobble around 16.7 ms.
    this.next = Math.max(this.next + MS_PER_SECOND / this.fps, now + MS_PER_SECOND / this.fps * PACE_SLACK);
    return true;
  }
}

export class TitleScene {
  private readonly ctx: Ctx2D;
  private back: AnyCanvas;
  private backCtx: Ctx2D;
  private w = 1;
  private h = 1;
  private sunX = 0;
  private sunHeight: number = TITLE_LAYOUT.sunHeight;
  private aimX = 0;
  private aimHeight: number = TITLE_LAYOUT.sunHeight;
  private aimed = false;
  private last = -1;
  private t = 0;
  private readonly firings: Firing[] = [];

  /** `canvas`: the title's; `makeCanvas`: a canvas of that size for the backdrop (an OffscreenCanvas in a worker). */
  constructor(private readonly canvas: AnyCanvas, private readonly makeCanvas: (w: number, h: number) => AnyCanvas) {
    this.ctx = canvas.getContext('2d') as Ctx2D;
    this.back = makeCanvas(1, 1);
    this.backCtx = this.back.getContext('2d') as Ctx2D;
  }

  /** The canvas's size in px. */
  resize(w: number, h: number): void {
    const first = this.w === 1;
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.back = this.makeCanvas(Math.max(1, Math.round(this.w * SCENE.backdrop)), Math.max(1, Math.round(this.h * SCENE.backdrop)));
    this.backCtx = this.back.getContext('2d') as Ctx2D;
    if (first) this.sunX = this.aimX = this.w * TITLE_LAYOUT.sunX;
  }

  /** The sun sent toward `x` (px) at `height` over the horizon (share of the height), where a finger put it. */
  aim(x: number, height: number): void {
    this.aimX = x;
    this.aimHeight = height;
    this.aimed = true;
  }

  /** A tap on the brig: the `n`th exchange of fire, starting now. */
  fire(n: number): void {
    this.firings.push({ start: this.t, plan: exchange(n), n });
  }

  /** Draws the picture at `now` (s, any clock that runs on). */
  frame(now: number): void {
    const dt = this.last < 0 ? 0 : Math.min(1, Math.max(0, now - this.last));
    this.last = now;
    this.t += dt;
    const L = TITLE_LAYOUT, ease = 1 - Math.exp(-dt / L.sunFollow);
    // Left alone, the sun sinks slowly toward the horizon: the light goes while the game prepares.
    if (!this.aimed && this.aimHeight > 0) this.aimHeight = Math.max(0, this.aimHeight - dt * L.sunSink);
    this.sunX += (this.aimX - this.sunX) * ease;
    this.sunHeight += (this.aimHeight - this.sunHeight) * ease;
    const p = paletteAt(this.sunHeight);
    this.backdrop(p);
    const c = this.ctx, w = this.w, h = this.h;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(this.back, 0, 0, w, h);
    const foe = this.foePose();
    this.brig(c, p, foe, false);
    this.swell(c, p);
    this.glitter(c, p);
    const her = this.herPose();
    this.reflection(c, p, her);
    this.gunfire(c, p, her, foe, true);
    this.brig(c, p, her, true);
    this.lap(c, p, her);
    this.gunfire(c, p, her, foe, false);
    this.gulls(c, p);
    this.vignette(c);
    this.skyFlash(c, p);
    while (this.firings.length > 0 && this.t - this.firings[0].start > this.lasts(this.firings[0])) this.firings.shift();
  }

  /** How long an exchange of fire is seen, s. */
  private lasts(f: Firing): number { return f.plan.answer + EXCHANGE.flight + SCENE.smokeLife; }

  private horizonY(): number { return this.h * TITLE_LAYOUT.horizon; }

  private herPose(): Pose {
    const L = TITLE_LAYOUT, at = brigPlace(this.w, this.h);
    return {
      x: at.x, y: at.y + Math.sin((this.t * TURN) / L.heavePeriod) * L.heave * this.h, length: at.length,
      pitch: Math.sin((this.t * TURN) / L.pitchPeriod) * L.pitch, facing: 1,
    };
  }

  private foePose(): Pose {
    const L = TITLE_LAYOUT;
    return { x: this.w * L.foeX, y: this.horizonY() + this.h * L.foeWater, length: this.h * L.foeLength, pitch: Math.sin((this.t * TURN) / L.pitchPeriod + 1) * L.pitch, facing: -1 };
  }

  /** The sky, the sun, the clouds and the sea's colour, soft, at the backdrop's resolution. */
  private backdrop(p: Palette): void {
    const c = this.backCtx, w = this.back.width, h = this.back.height, S = SCENE, hy = h * TITLE_LAYOUT.horizon;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    const sky = c.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, css(p.top));
    sky.addColorStop(STOP.skyMid, css(p.mid));
    sky.addColorStop(STOP.skyLow, css(p.low));
    sky.addColorStop(1, css(p.horizon));
    c.fillStyle = sky;
    c.fillRect(0, 0, w, hy + 1);
    // The stars, as the light goes.
    if (p.stars > 0) {
      c.fillStyle = css(WHITE);
      for (let i = 0; i < S.stars; i++) {
        const x = r3(i, STAR.x, KIND.star) * w, y = r3(i, STAR.y, KIND.star) ** 2 * hy * S.starDepth;
        const glow = (1 - y / (hy * S.starDepth)) * (1 / 2 + Math.sin(this.t * S.twinkle * (1 + r3(i, STAR.twinkle, KIND.star)) + r3(i, STAR.phase, KIND.star) * TURN) / 2);
        c.globalAlpha = p.stars * glow * r3(i, STAR.bright, KIND.star);
        const size = r3(i, STAR.size, KIND.star) * S.starSize + 1 / 2;
        c.fillRect(x, y, size, size);
      }
      c.globalAlpha = 1;
    }
    const sx = this.sunX * SCENE.backdrop, sy = hy - this.sunHeight * h, sr = h * S.sunRadius;
    const glow = c.createRadialGradient(sx, sy, 0, sx, sy, h * S.glow);
    glow.addColorStop(0, css(p.glow, S.glowStrength));
    glow.addColorStop(STOP.glow, css(p.glow, S.glowStrength / 2));
    glow.addColorStop(1, css(p.glow, 0));
    c.fillStyle = glow;
    c.fillRect(0, 0, w, hy + 1);
    const halo = c.createRadialGradient(sx, sy, sr / 2, sx, sy, sr * S.halo);
    halo.addColorStop(0, css(p.sun, 1));
    halo.addColorStop(STOP.halo, css(p.sun, 1 / 2));
    halo.addColorStop(1, css(p.sun, 0));
    c.fillStyle = halo;
    c.beginPath();
    c.arc(sx, sy, sr * S.halo, 0, TURN);
    c.fill();
    this.rays(c, p, sx, sy, w, hy);
    this.clouds(c, p, w, h, sx);
    // The sea: its colour far and near, the sun's soft column on it, the haze along the horizon.
    const sea = c.createLinearGradient(0, hy, 0, h);
    sea.addColorStop(0, css(p.seaFar));
    sea.addColorStop(1, css(p.sea));
    c.fillStyle = sea;
    c.fillRect(0, hy, w, h - hy);
    const seen = this.sunSeen();
    if (seen > 0) {
      c.save();
      c.translate(sx, hy);
      c.scale(w * S.column / (h - hy), 1);
      const col = c.createRadialGradient(0, 0, 0, 0, 0, h - hy);
      col.addColorStop(0, css(p.glow, S.columnStrength * seen));
      col.addColorStop(1, css(p.glow, 0));
      c.fillStyle = col;
      c.fillRect(-(h - hy), 0, (h - hy) * 2, h - hy);
      c.restore();
    }
    const haze = c.createLinearGradient(0, hy - h * S.haze, 0, hy + h * S.haze);
    haze.addColorStop(0, css(p.horizon, 0));
    haze.addColorStop(1 / 2, css(p.horizon, S.hazeStrength));
    haze.addColorStop(1, css(p.horizon, 0));
    c.fillStyle = haze;
    c.fillRect(0, hy - h * S.haze, w, h * S.haze * 2);
  }

  /** Rays from the sun fanning across the sky, turning very slowly. */
  private rays(c: Ctx2D, p: Palette, sx: number, sy: number, w: number, hy: number): void {
    const S = SCENE, seen = this.sunSeen(), reach = w * S.rayReach;
    if (seen <= 0) return;
    c.save();
    c.beginPath();
    c.rect(0, 0, w, hy);
    c.clip();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, reach);
    g.addColorStop(0, css(p.glow, S.rayStrength * seen));
    g.addColorStop(1, css(p.glow, 0));
    c.fillStyle = g;
    c.beginPath();
    for (let i = 0; i < S.rays; i++) {
      const a = (i / S.rays) * TURN + this.t * S.raySpin * (i % 2 ? 1 : -1), half = S.rayWidth * (1 / 2 + r3(i, 0, KIND.ray));
      c.moveTo(sx, sy);
      c.lineTo(sx + Math.cos(a - half) * reach, sy + Math.sin(a - half) * reach);
      c.lineTo(sx + Math.cos(a + half) * reach, sy + Math.sin(a + half) * reach);
      c.closePath();
    }
    c.fill();
    c.restore();
  }

  /** How much of the sun is above the horizon, 0..1. */
  private sunSeen(): number {
    const r = SCENE.sunRadius;
    return Math.min(1, Math.max(0, (this.sunHeight + r) / (r * 2)));
  }

  private clouds(c: Ctx2D, p: Palette, w: number, h: number, sx: number): void {
    const S = SCENE;
    for (const [i, [x0, y0, cw, ch, drift]] of S.clouds.entries()) {
      const x = (((x0 + this.t * drift) % S.cloudWrap) + S.cloudWrap) % S.cloudWrap - (S.cloudWrap - 1) / 2;
      const cx = x * w, cy = y0 * h, lit = Math.max(0, 1 - Math.abs(cx - sx) / w);
      for (let k = 0; k < S.cloudPuffs; k++) {
        const u = k / (S.cloudPuffs - 1) - 1 / 2, rad = ch * h * (1 + r3(i, k, KIND.cloud)) * (1 - Math.abs(u));
        const px = cx + u * cw * w, py = cy + Math.sin(k * 2 + i) * ch * h / 2;
        for (const [shade, down] of [[p.cloud, -S.cloudShade], [mix(p.cloud, p.cloudLit, lit), S.cloudShade]] as const) {
          c.save();
          c.translate(px, py + down * rad * S.cloudFlat);
          c.scale(S.cloudStretch, S.cloudFlat);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, rad * 2);
          g.addColorStop(0, css(shade, S.cloudAlpha));
          g.addColorStop(1, css(shade, 0));
          c.fillStyle = g;
          c.fillRect(-rad * 2, -rad * 2, rad * 2 * 2, rad * 2 * 2);
          c.restore();
        }
      }
    }
  }

  /** The swell's lines, running aft past her. */
  private swell(c: Ctx2D, p: Palette): void {
    const S = SCENE, w = this.w, h = this.h, hy = this.horizonY();
    c.lineWidth = Math.max(1, h / (S.waveRows * S.waveRows));
    const light = mix(p.seaFar, p.horizon, 1 / 2);
    for (let k = 1; k <= S.waveRows; k++) {
      const d = (k / S.waveRows) ** 2, y = hy + d * (h - hy), amp = S.waveHeight * h * d;
      const length = w * (S.waveFar + (S.waveNear - S.waveFar) * d), phase = (this.t * S.flow * w) / length + r3(k, 0, KIND.wave) * TURN;
      for (const [shade, off, alpha] of [[light, 0, S.waveAlphaFar + (S.waveAlphaNear - S.waveAlphaFar) * d], [p.sea, amp, S.waveAlphaNear]] as const) {
        c.strokeStyle = css(shade, alpha);
        c.beginPath();
        for (let i = 0; i <= S.waveSteps; i++) {
          const x = (i / S.waveSteps) * w;
          const yy = y + off + amp * Math.sin((x / length) * TURN - phase) + (amp / 2) * Math.sin((x / length) * TURN * 2 + phase);
          if (i === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
        }
        c.stroke();
      }
    }
  }

  /** The sun's glitter on the swell: glints flashing in a path that widens toward the eye. */
  private glitter(c: Ctx2D, p: Palette): void {
    const S = SCENE, w = this.w, h = this.h, hy = this.horizonY(), seen = this.sunSeen();
    if (seen <= 0) return;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = css(mix(p.sun, p.glow, 1 / 2));
    for (let k = 1; k <= S.glitterRows; k++) {
      const d = (k / S.glitterRows) ** 2, y = hy + d * (h - hy);
      const spread = w * (S.spreadFar + (S.spreadNear - S.spreadFar) * d) * (1 / 2 + seen / 2);
      const len = w * (S.glintFar + (S.glintNear - S.glintFar) * d), thick = h * (S.thickFar + (S.thickNear - S.thickFar) * d);
      for (let j = 0; j < S.glints; j++) {
        const a = r3(k * S.glints + j, GLINT.off, KIND.glint), b = r3(k * S.glints + j, GLINT.more, KIND.glint), e = r3(k * S.glints + j, GLINT.phase, KIND.glint);
        const off = (a + b - 1) * spread + Math.sin(this.t * (1 / 2 + e) + a * TURN) * spread / S.glints;
        const flash = Math.max(0, Math.sin(this.t * (S.sparkle + S.sparkleMore * b) + e * TURN)) ** S.sparkleSharp;
        const alpha = flash * seen * Math.max(0, 1 - Math.abs(off) / spread);
        if (alpha < 1 / S.glitterRows) continue;
        c.globalAlpha = alpha;
        c.fillRect(this.sunX + off - len / 2, y, len, thick);
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /** Her reflection under her, in strips the swell sways apart. */
  private reflection(c: Ctx2D, p: Palette, pose: Pose): void {
    const S = SCENE, strip = (pose.length * (1 + BRIG.spar[1][1])) / S.strips;
    for (let i = 0; i < S.strips; i++) {
      const top = pose.y + i * strip, sway = Math.sin(this.t * (1 + i / S.strips) * 2 + i * 2) * this.w * S.sway * (1 + i / S.strips);
      c.save();
      c.beginPath();
      c.rect(0, top, this.w, strip + 1);
      c.clip();
      c.globalAlpha = S.reflection * (1 - i / S.strips);
      this.setToBrig(c, { ...pose, x: pose.x + sway }, true);
      this.hullAndSails(c, p, pose, false);
      c.restore();
    }
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The canvas set to a brig's own units at `pose` (mirrored in the water when `flipped`). */
  private setToBrig(c: Ctx2D, pose: Pose, flipped = false): void {
    const s = pose.length, cos = Math.cos(pose.pitch), sin = Math.sin(pose.pitch), f = pose.facing, up = flipped ? -1 : 1;
    c.setTransform(f * s * cos, -f * s * sin, -up * s * sin, -up * s * cos, pose.x, pose.y);
  }

  /** Where a point of the brig (her units) is on the screen at `pose`. */
  private onScreen(pose: Pose, u: number, v: number): [number, number] {
    const s = pose.length, cos = Math.cos(pose.pitch), sin = Math.sin(pose.pitch), x = u * pose.facing;
    return [pose.x + s * (x * cos - v * sin), pose.y - s * (x * sin + v * cos)];
  }

  /** A brig: hull, sails, spars and (near) her rigging and pennant, clipped at her waterline. */
  private brig(c: Ctx2D, p: Palette, pose: Pose, near: boolean): void {
    c.save();
    this.setToBrig(c, pose);
    c.beginPath();
    c.rect(ABOVE_WATER.from, 0, ABOVE_WATER.width, ABOVE_WATER.height);
    c.clip();
    this.hullAndSails(c, p, pose, near);
    if (near) this.rigging(c, p, pose);
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (near) this.foam(c, p, pose);
  }

  private hullAndSails(c: Ctx2D, p: Palette, pose: Pose, near: boolean): void {
    const B = BRIG, S = SCENE, px = 1 / pose.length;
    const climb = Math.min(1, Math.max(0, this.sunHeight / TITLE_LAYOUT.sunHighest));
    const sail = mix(p.hull, mix(p.glow, p.cloudLit, climb), S.sailLight + S.sailClimb * climb);
    // The canvas glows where the low sun shines through it: brighter on the side toward the sun and aloft.
    const toSun = (this.sunX - pose.x) * pose.facing >= 0 ? 1 : -1;
    const fill = c.createLinearGradient(-toSun * (1 / 2), 0, toSun * (1 / 2), 1);
    fill.addColorStop(0, css(mix(sail, p.hull, S.sailShade)));
    fill.addColorStop(1, css(sail));
    const rim = c.createLinearGradient(-toSun, 0, toSun * (1 / 2), 0);
    rim.addColorStop(0, css(p.sun, 0));
    rim.addColorStop(1, css(p.sun, S.rim * this.sunSeen()));
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // Spars.
    c.strokeStyle = css(p.hull);
    c.lineWidth = S.spar * px;
    c.beginPath();
    for (const m of B.masts) { c.moveTo(m.x, 0); c.lineTo(m.x + m.rake * m.heads[2], m.heads[2]); }
    for (const [i, pt] of B.spar.entries()) { if (i === 0) c.moveTo(pt[0], pt[1]); else c.lineTo(pt[0], pt[1]); }
    c.stroke();
    // Square sails, bellied forward by the wind from astern.
    for (const [mi, m] of B.masts.entries()) {
      for (const s of B.sails[mi]) {
        const top = m.x + m.rake * s.yard, bottom = m.x + m.rake * s.foot, mid = (s.yard + s.foot) / 2;
        const cloth = new Path2D();
        cloth.moveTo(top - s.half, s.yard);
        cloth.lineTo(top + s.half, s.yard);
        cloth.quadraticCurveTo((top + bottom) / 2 + s.footHalf - B.belly, mid, bottom + s.footHalf, s.foot);
        cloth.quadraticCurveTo(bottom, s.foot + B.roach, bottom - s.footHalf, s.foot);
        cloth.quadraticCurveTo((top + bottom) / 2 - s.footHalf - B.belly, mid, top - s.half, s.yard);
        c.fillStyle = fill;
        c.fill(cloth);
        if (near) {
          // Her cloths: the light through the seams, a line down the sail every cloth's width.
          c.save();
          c.clip(cloth);
          c.strokeStyle = css(p.sun, S.seam * this.sunSeen());
          c.lineWidth = px;
          c.beginPath();
          for (let x = -s.footHalf; x <= s.footHalf; x += S.cloth) {
            c.moveTo(top + x * (s.half / s.footHalf), s.yard);
            c.quadraticCurveTo((top + bottom) / 2 + x - B.belly, mid, bottom + x, s.foot + B.roach);
          }
          c.stroke();
          c.restore();
          c.strokeStyle = rim; c.lineWidth = px; c.stroke(cloth);
        }
        c.strokeStyle = css(p.hull);
        c.lineWidth = S.spar * px;
        c.beginPath();
        c.moveTo(top - s.half * (1 + B.belly), s.yard);
        c.lineTo(top + s.half * (1 + B.belly), s.yard);
        c.stroke();
      }
    }
    // Head sails from the fore mast to the bowsprit and jib-boom.
    const fore = B.masts[0];
    for (const [[tx, ty], head, [clewX, clewY]] of B.jibs) {
      const hx = fore.x + fore.rake * head;
      c.beginPath();
      c.moveTo(hx, head);
      c.quadraticCurveTo((hx + tx) / 2 - B.belly, (head + ty) / 2, tx, ty);
      c.lineTo(clewX, clewY);
      c.quadraticCurveTo((hx + clewX) / 2 - B.belly, (head + clewY) / 2, hx, head);
      c.fillStyle = fill;
      c.fill();
      if (near) { c.strokeStyle = rim; c.lineWidth = px; c.stroke(); }
    }
    // The spanker, gaff and boom.
    const main = B.masts[1], sp = B.spanker, throatX = main.x + main.rake * sp.throat, tackX = main.x + main.rake * sp.tack;
    c.beginPath();
    c.moveTo(throatX, sp.throat);
    c.lineTo(sp.peak[0], sp.peak[1]);
    c.quadraticCurveTo((sp.peak[0] + sp.clew[0]) / 2 - B.belly, (sp.peak[1] + sp.clew[1]) / 2, sp.clew[0], sp.clew[1]);
    c.lineTo(tackX, sp.tack);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (near) { c.strokeStyle = rim; c.lineWidth = px; c.stroke(); }
    // The hull, her chequer band and ports.
    c.beginPath();
    for (const [i, pt] of B.hull.entries()) { if (i === 0) c.moveTo(pt[0], pt[1]); else c.lineTo(pt[0], pt[1]); }
    c.closePath();
    c.fillStyle = css(p.hull);
    c.fill();
    if (near) {
      c.strokeStyle = rim;
      c.lineWidth = px;
      c.stroke();
      c.fillStyle = css(mix(p.hull, p.glow, S.band));
      c.fillRect(B.bandFrom, B.bandLow, B.bandTo - B.bandFrom, B.bandHigh - B.bandLow);
      c.fillStyle = css(p.hull);
      for (const x of B.ports) c.fillRect(x - B.portHalf, B.bandLow, B.portHalf * 2, B.bandHigh - B.bandLow);
    }
  }

  /** Her standing rigging and her pennant, thin lines against the light. */
  private rigging(c: Ctx2D, p: Palette, pose: Pose): void {
    const B = BRIG, px = 1 / pose.length, [fore, main] = B.masts, at = (m: Mast, k: number) => m.x + m.rake * m.heads[k];
    c.strokeStyle = css(p.hull, SCENE.lineAlpha);
    c.lineWidth = SCENE.line * px;
    c.beginPath();
    for (const m of B.masts) {
      // Shrouds from the lower mast head to her channels, topmast shrouds to the top, a backstay aft.
      for (let k = -2; k <= 2; k++) { c.moveTo(at(m, 0), m.heads[0]); c.lineTo(m.x + (k * B.chainSpread) / 2, B.chains); }
      for (const k of [-1, 1]) { c.moveTo(at(m, 1), m.heads[1]); c.lineTo(at(m, 0) + k * B.chainSpread / 2, m.heads[0]); }
      c.moveTo(at(m, 2), m.heads[2]); c.lineTo(m.x + B.chainSpread * 2, B.chains);
    }
    // Stays: the fore mast's to the bowsprit and jib-boom, the main mast's to the fore mast.
    c.moveTo(at(fore, 0), fore.heads[0]); c.lineTo(B.spar[1][0], B.spar[1][1]);
    c.moveTo(at(fore, 2), fore.heads[2]); c.lineTo(B.spar[2][0], B.spar[2][1]);
    for (let k = 0; k < fore.heads.length; k++) { c.moveTo(at(main, k), main.heads[k]); c.lineTo(fore.x + fore.rake * (fore.heads[k] / 2), fore.heads[k] / 2 + B.chains); }
    c.stroke();
    // The pennant at the main truck, streaming forward and fluttering.
    const steps = SCENE.lapWaves, top = main.heads[2];
    c.beginPath();
    c.moveTo(at(main, 2), top);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      c.lineTo(at(main, 2) - u * B.pennant, top - u * B.flutter + Math.sin(u * TURN - this.t * SCENE.gullFlap * 2) * B.flutter * u);
    }
    c.lineWidth = SCENE.spar * px;
    c.stroke();
  }

  /** Her bow wave and the wash under her counter. */
  private foam(c: Ctx2D, p: Palette, pose: Pose): void {
    const S = SCENE, white = mix(p.cloudLit, p.sun, 1 / 2), s = pose.length;
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = css(white, S.foam);
    c.lineWidth = Math.max(1, s * S.lap / 2);
    const bow = this.onScreen(pose, BRIG.hull[3][0], 0), stern = this.onScreen(pose, BRIG.hull[2][0], 0);
    c.beginPath();
    for (let k = 0; k < 2 + 1; k++) {
      const reach = s * S.lap * (k + 1) * (1 + Math.sin(this.t * 2 + k) * S.surge);
      c.moveTo(bow[0] - reach * 2, bow[1] + reach / 2);
      c.quadraticCurveTo(bow[0] - reach, bow[1] - reach / 2, bow[0] + reach * 2, bow[1]);
      c.moveTo(stern[0] - reach, stern[1] + reach / 2);
      c.lineTo(stern[0] + reach * 2 + reach, stern[1] + reach);
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  }

  /** The water lapping along her waterline, in front of her hull. */
  private lap(c: Ctx2D, p: Palette, pose: Pose): void {
    const S = SCENE, a = this.onScreen(pose, BRIG.spar[2][0], 0), b = this.onScreen(pose, BRIG.hull[1][0] + S.lap * 2, 0);
    const amp = pose.length * S.lap, n = S.lapWaves * 2;
    c.fillStyle = css(mix(p.seaFar, p.sea, 1 / 2));
    c.beginPath();
    c.moveTo(a[0], a[1] + amp * 2);
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
      c.lineTo(x, y + amp / 2 + Math.sin(u * S.lapWaves * TURN - this.t * 2) * amp / 2);
    }
    c.lineTo(b[0], b[1] + amp * 2);
    c.closePath();
    c.fill();
  }

  /** Muzzle flashes, smoke and splashes: those beyond her (`behind`) before she is drawn, the rest after. */
  private gunfire(c: Ctx2D, p: Palette, her: Pose, foe: Pose, behind: boolean): void {
    const S = SCENE, E = EXCHANGE, w = this.w, h = this.h;
    for (const f of this.firings) {
      const t = this.t - f.start, plan = f.plan;
      if (behind) {
        // Her ball falls far off by the other brig; the other's flash and smoke on the horizon.
        this.splashAt(c, p, plan.fall[0] * w, plan.fall[1] * h, t - E.flight);
        const muzzle = this.onScreen(foe, BRIG.ports[BRIG.ports.length - 1 - plan.port], (BRIG.bandLow + BRIG.bandHigh) / 2);
        this.smoke(c, p, muzzle, foe.length * S.foePuff, t - plan.answer, -1 - f.n);
        this.flash(c, muzzle, foe.length * S.foeFlash, t - plan.answer);
      } else {
        const muzzle = this.onScreen(her, BRIG.ports[plan.port], (BRIG.bandLow + BRIG.bandHigh) / 2);
        this.smoke(c, p, muzzle, her.length, t, f.n);
        this.flash(c, muzzle, her.length * S.flashSize, t);
        this.splashAt(c, p, plan.answerFall[0] * w, plan.answerFall[1] * h, t - plan.answer - E.flight);
      }
    }
  }

  private flash(c: Ctx2D, [x, y]: [number, number], size: number, t: number): void {
    if (t < 0 || t > SCENE.flash) return;
    const k = 1 - t / SCENE.flash, r = size * (1 / 2 + k / 2);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(FLASH, k));
    g.addColorStop(STOP.flash, css(FLASH, k / 2));
    g.addColorStop(1, css(FLASH, 0));
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.globalCompositeOperation = 'source-over';
  }

  /** A gun's smoke: puffs that burst out of the port toward the eye, then grow, drift with the wind and fade; `unit`: the ship's length (px) the smoke is sized by. */
  private smoke(c: Ctx2D, p: Palette, [x, y]: [number, number], unit: number, t: number, seed: number): void {
    const S = SCENE;
    if (t < 0 || t > S.smokeLife) return;
    const climb = Math.min(1, Math.max(0, this.sunHeight / TITLE_LAYOUT.sunHighest));
    const lit = mix(mix(SMOKE_GREY, p.cloudLit, 1 / 2), p.glow, (1 - climb) / 2), fade = (1 - t / S.smokeLife) ** 2;
    const out = 1 - Math.exp(-t / S.burstTime), size = unit * S.puffSize;
    for (let k = 0; k < S.puffs; k++) {
      const a = hash2f(seed, k, 0) * Math.PI, reach = unit * S.burst * (1 / 2 + hash2f(seed, k, 1));
      const px = x + Math.cos(a) * reach * out - this.w * S.smokeDrift * t, py = y + Math.sin(a) * reach * out / 2 - this.h * S.smokeRise * t;
      const r = size * (1 / 2 + hash2f(seed, k, 2)) + unit * S.puffGrow * t;
      const g = c.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, css(lit, S.smokeAlpha * fade));
      g.addColorStop(1 / 2, css(lit, S.smokeAlpha * fade / 2));
      g.addColorStop(1, css(lit, 0));
      c.fillStyle = g;
      c.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  /** A ball's splash: a column of white water that rises and falls back, smaller far off. */
  private splashAt(c: Ctx2D, p: Palette, x: number, y: number, t: number): void {
    const S = SCENE;
    if (t < 0 || t > S.splash) return;
    const hy = this.horizonY(), d = Math.max(0, (y - hy) / (this.h - hy)), size = this.h * (S.splashFar + (S.splashNear - S.splashFar) * d);
    const rise = Math.sin(Math.PI * Math.min(1, t / S.splash)) * size * S.splashRise, fade = 1 - t / S.splash;
    const water = mix(SPRAY, p.cloudLit, 1 / 2);
    c.save();
    c.translate(x, y - rise / 2);
    c.scale(size / 2, Math.max(1, rise / 2));
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, css(water, fade));
    g.addColorStop(1, css(water, 0));
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
  }

  private gulls(c: Ctx2D, p: Palette): void {
    const S = SCENE, w = this.w, h = this.h;
    c.strokeStyle = css(p.hull, S.lineAlpha);
    c.lineCap = 'round';
    for (const [x0, y0, speed, size, phase] of S.gulls) {
      const x = ((((x0 + this.t * speed) % S.gullWrap) + S.gullWrap) % S.gullWrap - (S.gullWrap - 1) / 2) * w;
      const y = (y0 + Math.sin(this.t / 2 + phase) * S.gullBob) * h, s = size * h, flap = Math.sin(this.t * S.gullFlap + phase);
      c.lineWidth = Math.max(1, s / (2 + 2 + 1));
      c.beginPath();
      c.moveTo(x - s, y - flap * s / 2);
      c.quadraticCurveTo(x - s / 2, y - s / 2 - flap * s / 2, x, y);
      c.quadraticCurveTo(x + s / 2, y - s / 2 - flap * s / 2, x + s, y - flap * s / 2);
      c.stroke();
    }
  }

  private vignette(c: Ctx2D): void {
    const w = this.w, h = this.h, r = Math.hypot(w, h) / 2;
    const g = c.createRadialGradient(w / 2, h / 2, r / 2, w / 2, h / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${SCENE.vignette})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  /** The whole sky lit a moment by her gun. */
  private skyFlash(c: Ctx2D, p: Palette): void {
    let k = 0;
    for (const f of this.firings) { const t = this.t - f.start; if (t >= 0 && t < SCENE.flash) k = Math.max(k, 1 - t / SCENE.flash); }
    if (k <= 0) return;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = css(p.glow, SCENE.skyFlash * k);
    c.fillRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'source-over';
  }
}
