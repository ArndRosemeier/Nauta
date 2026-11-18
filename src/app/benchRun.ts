/**
 * The bench on the page (`?bench`, plan N1.9): flies the eye along the bench's path (bench.ts), measures each frame
 * and shows the frame times and memory on the screen, since the tablet has no developer tools at hand. The result
 * stays up until "Run again".
 */
import { BENCH_SETTLE_SECONDS, benchPose, frameStats, statsLines, type BenchPose } from './bench';
import { formatBytes } from '../probe/report';
import { MS_PER_SECOND } from '../sim/units';

/** How often the live line and the memory are read, ms. */
const SAMPLE_EVERY_MS = 500;

/** Memory as the page can learn it, bytes. */
export interface BenchMemory {
  /** What three.js counts on the GPU: geometry, textures, programs, buffers. */
  readonly gpu: number;
  /** The script's heap, where the browser tells it (Chrome does, Safari does not). */
  readonly js: number | null;
}

/** What the page tells the bench about itself. */
export interface BenchProbe {
  /** Whether the page has settled (its quality level chosen): the flight waits at its start until then. */
  readonly settled: () => boolean;
  readonly memory: () => BenchMemory;
  /** One line on what is drawn and how (backend, size, the scene). */
  readonly about: () => string;
  /** One line on the shaders: built in the warm-up and any built later (none is the rule). */
  readonly shaders: () => string;
}

declare global {
  interface Window {
    /** The bench's result as text once it has finished (the headless check reads it). */
    __nautaBench?: string;
  }
  interface Performance {
    /** Chrome's heap figures (not standard). */
    readonly memory?: { readonly usedJSHeapSize: number };
  }
}

export class BenchRun {
  private start = -1;
  private last = 0;
  private sampled = 0;
  private frames: number[] = [];
  private work: number[] = [];
  private peakGpu = 0;
  private peakJs: number | null = null;
  private done = false;
  private readonly pose: BenchPose = benchPose(0, 1);

  /** `el`: where the bench writes; `seconds`: how long it flies and measures. */
  constructor(private readonly el: HTMLElement, private readonly seconds: number, private readonly probe: BenchProbe) {
    el.style.display = 'block';
    el.textContent = 'bench · waiting for the first frame';
  }

  /** The eye's place this frame; call at the start of every frame. */
  fly(now: number): BenchPose {
    if (this.start < 0 && !this.probe.settled()) { this.el.textContent = 'bench · waiting for the quality level'; return benchPose(0, this.seconds, this.pose); }
    if (this.start < 0) { this.start = now; this.last = now; this.sampled = now; }
    const t = (now - this.start) / MS_PER_SECOND - BENCH_SETTLE_SECONDS;
    if (!this.done && t > 0) this.frames.push(now - this.last);
    this.last = now;
    if (!this.done && now - this.sampled >= SAMPLE_EVERY_MS) {
      this.sampled = now;
      this.readMemory();
      this.el.textContent = t < 0 ? 'bench · settling' : `bench · ${Math.floor(t)} of ${this.seconds} s\n${statsLines(frameStats(this.samples()))[0]}`;
    }
    if (!this.done && t >= this.seconds) this.finish();
    return benchPose(t, this.seconds, this.pose);
  }

  /** The page's own work this frame took, ms; call at the end of every frame. */
  worked(ms: number): void {
    if (!this.done && this.frames.length) this.work.push(ms);
  }

  private samples() { return { frames: this.frames, work: this.work }; }

  private readMemory(): void {
    const m = this.probe.memory();
    this.peakGpu = Math.max(this.peakGpu, m.gpu);
    if (m.js !== null) this.peakJs = Math.max(this.peakJs ?? 0, m.js);
  }

  private finish(): void {
    this.done = true;
    this.readMemory();
    const m = this.probe.memory();
    const js = m.js === null || this.peakJs === null ? 'script heap: this browser does not tell' : `script heap ${formatBytes(m.js)} (peak ${formatBytes(this.peakJs)})`;
    const text = [
      `BENCH · ${this.seconds} s flight · ${this.probe.about()}`,
      ...statsLines(frameStats(this.samples())),
      `GPU memory (three's count) ${formatBytes(m.gpu)} (peak ${formatBytes(this.peakGpu)}) · ${js}`,
      this.probe.shaders(),
    ].join('\n');
    window.__nautaBench = text;
    this.el.textContent = text;
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Run again';
    again.addEventListener('click', () => this.restart());
    this.el.append('\n', again);
  }

  private restart(): void {
    this.start = -1;
    this.frames = [];
    this.work = [];
    this.peakGpu = 0;
    this.peakJs = null;
    this.done = false;
    this.el.textContent = 'bench · settling';
  }
}
