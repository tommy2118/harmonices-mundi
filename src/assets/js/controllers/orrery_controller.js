import { Controller } from "@hotwired/stimulus";
import { PLANETS, positionAt, orbitPath, emptyFocus, dateFromDays, daysSinceJ2000, periodDays } from "../lib/ephemeris.js";
import { toStage, PALETTE, SIZES } from "../lib/stage.js";
import Clock from "../lib/clock.js";
import Camera from "../lib/camera.js";
import Choir from "../lib/choir.js";
import Orrery from "../lib/orrery.js";

/**
 * Orrery Controller
 *
 * The one joint in the body. Owns the frame loop and passes messages between
 * Clock, Ephemeris, Camera, Choir, and the Orrery renderer. Chapters talk to
 * it only through the `orrery:chapter` window event.
 */
export default class extends Controller {
  static targets = ["canvas", "date", "rate", "audio", "hz", "meter", "fallback"];

  connect() {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.clock = new Clock({ days: daysSinceJ2000(new Date()), rate: this.reducedMotion ? 4 : 20 });
    this.camera = new Camera();
    if (this.reducedMotion) this.camera.autoSpin = 0;
    this.choir = new Choir({ createContext: () => new (window.AudioContext || window.webkitAudioContext)() });

    try {
      this.orrery = new Orrery(this.canvasTarget);
    } catch (error) {
      this.showFallback(error);
      return;
    }

    // Every trail covers the same fraction of its planet's orbit, so the wedge
    // in the Equal Areas chapter is a fixed span of days for that planet.
    this.trailLength = 140;
    this.trailFraction = 0.25;
    this.planets = PLANETS.map((planet) => ({
      planet,
      key: planet.key,
      color: PALETTE[planet.key],
      size: SIZES[planet.key],
      pos: [0, 0, 0],
      trail: [],
      trailDays: [],
      lastSample: -Infinity,
      pulse: 0,
      tempo: 1,
    }));

    this.orrery.setPaths(
      PLANETS.map((planet) => ({ key: planet.key, points: orbitPath(planet, 360).slice(0, -1).map(toStage) }))
    );

    this.focus = null;
    this.onChapter = (event) => this.applyChapter(event.detail);
    window.addEventListener("orrery:chapter", this.onChapter);

    this.bindPointer();

    this.lastFrame = performance.now();
    this.elapsed = 0;
    this.frame = (now) => this.step(now);
    this.raf = requestAnimationFrame(this.frame);
  }

  disconnect() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("orrery:chapter", this.onChapter);
    this.choir.stop();
  }

  showFallback(error) {
    console.warn("Orrery could not start:", error);
    if (this.hasFallbackTarget) this.fallbackTarget.hidden = false;
  }

  // -- Chapters --------------------------------------------------------------

  applyChapter({ rate, distance, elevation, focus, sweep, layout }) {
    if (rate !== undefined) this.clock.setRate(this.reducedMotion ? Math.min(rate, 6) : rate);
    const narrow = window.innerWidth < 640;
    this.camera.setPose({
      distance: narrow ? distance * 1.5 : distance,
      elevation: elevation * (Math.PI / 180),
      ...this.shiftFor(layout, narrow),
    });
    if (focus) {
      const planet = PLANETS.find((p) => p.key === focus);
      const path = orbitPath(planet, 720);
      let far = path[0], near = path[0];
      for (const p of path) {
        if (p.r > far.r) far = p;
        if (p.r < near.r) near = p;
      }
      this.focus = {
        key: focus,
        emptyFocus: toStage(emptyFocus(planet)),
        axis: [toStage(far), toStage(near)],
        sweep: Boolean(sweep),
      };
    } else {
      this.focus = null;
    }
  }

  // Where the scene sits relative to the text. Cards sit to the right on wide
  // screens and at the bottom on narrow ones; the hero title sits above.
  shiftFor(layout, narrow) {
    if (layout === "hero") return narrow ? { shiftX: 0, shiftY: 0.55 } : { shiftX: 0.42, shiftY: 0 };
    if (layout === "aside") return narrow ? { shiftX: 0, shiftY: 0.5 } : { shiftX: -0.26, shiftY: 0 };
    return { shiftX: 0, shiftY: 0 };
  }

  // -- Audio -----------------------------------------------------------------

  async toggleAudio() {
    if (this.choir.running) {
      await this.choir.stop();
      this.audioTarget.setAttribute("aria-pressed", "false");
      this.audioTarget.textContent = "Listen";
    } else {
      await this.choir.start();
      this.audioTarget.setAttribute("aria-pressed", "true");
      this.audioTarget.textContent = "Silence";
    }
  }

  // -- Pointer ---------------------------------------------------------------

  bindPointer() {
    const canvas = this.canvasTarget;
    let last = null;
    canvas.addEventListener("pointerdown", (e) => {
      last = [e.clientX, e.clientY];
      this.camera.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      this.camera.drag(e.clientX - last[0], e.clientY - last[1]);
      last = [e.clientX, e.clientY];
    });
    const release = () => {
      last = null;
      this.camera.dragging = false;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  // -- Frame loop ------------------------------------------------------------

  step(now) {
    const dt = Math.max(0, Math.min(0.1, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.elapsed += dt;

    const days = this.clock.tick(dt);
    this.camera.aspect = this.canvasTarget.clientWidth / Math.max(1, this.canvasTarget.clientHeight);
    this.camera.update(dt);

    for (const p of this.planets) {
      const state = positionAt(p.planet, days);
      p.pos = toStage(state);
      p.tempo = state.tempo;
      p.pulse = Math.max(0, p.pulse - dt * 1.5);

      // Every trail spans the same fraction of its planet's orbit, measured in
      // days, whatever the clock rate. Samples are spaced so the count stays
      // bounded, and old samples are pruned by age.
      const span = periodDays(p.planet) * this.trailFraction;
      const stride = span / this.trailLength;
      if (Math.abs(days - p.lastSample) >= stride) {
        p.trail.push(p.pos);
        p.trailDays.push(days);
        p.lastSample = days;
      }
      while (p.trailDays.length && Math.abs(days - p.trailDays[0]) > span) {
        p.trail.shift();
        p.trailDays.shift();
      }
      // Keep the trail head glued to the planet.
      if (p.trail.length) p.trail[p.trail.length - 1] = p.pos;

      this.choir.setTempo(p.key, p.tempo);
    }

    this.orrery.render({
      time: this.elapsed,
      dpr: Math.min(2, window.devicePixelRatio || 1),
      camera: this.camera,
      planets: this.planets,
      focus: this.focus,
    });

    this.updateReadouts(days);
    this.raf = requestAnimationFrame(this.frame);
  }

  updateReadouts(days) {
    if ((this.readoutTick = (this.readoutTick || 0) + 1) % 6 !== 0) return;

    if (this.hasDateTarget) {
      this.dateTarget.textContent = dateFromDays(days).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    }
    if (this.hasRateTarget) {
      const r = this.clock.rate;
      this.rateTarget.textContent = r >= 1 ? `${r.toFixed(0)} d/s` : `${(r * 24).toFixed(1)} h/s`;
    }

    const pitches = this.choir.pitches;
    for (const el of this.hzTargets) {
      const hz = pitches[el.dataset.planet];
      if (hz) el.textContent = `${hz.toFixed(1)} Hz`;
    }
    for (const el of this.meterTargets) {
      const p = this.planets.find((x) => x.key === el.dataset.planet);
      if (!p) continue;
      const max = Math.pow((1 + p.planet.e) / (1 - p.planet.e), 2);
      const frac = max > 1 ? (p.tempo - 1) / (max - 1) : 0;
      el.style.setProperty("--fill", `${(frac * 100).toFixed(1)}%`);
    }
  }
}
