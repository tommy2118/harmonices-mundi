// =============================================================================
// CHOIR
// Six voices. Each is told a tempo (angular velocity relative to aphelion)
// and glides its pitch to match. Refuses to know anything about orbits:
// the planet is just a name, a base pitch, and a number between 1 and ~2.4.
//
// The AudioContext is injected so tests and non-browser code can hand in a
// fake, and so the page decides when the user has gestured.
// =============================================================================

export const VOICES = [
  // Aphelion pitches loosely follow Kepler's own staff placement in Book V:
  // Saturn and Jupiter in the bass, Mars and Earth in the tenor, Venus and
  // Mercury above.
  { key: "saturn",  hz: 98.0,   wave: "triangle", gain: 0.22 },
  { key: "jupiter", hz: 123.47, wave: "triangle", gain: 0.2 },
  { key: "mars",    hz: 174.61, wave: "sine",     gain: 0.16 },
  { key: "earth",   hz: 196.0,  wave: "sine",     gain: 0.15 },
  { key: "venus",   hz: 329.63, wave: "sine",     gain: 0.1 },
  { key: "mercury", hz: 261.63, wave: "sine",     gain: 0.09 },
];

function impulseResponse(ctx, seconds = 4, decay = 3) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export default class Choir {
  constructor({ createContext }) {
    this.createContext = createContext;
    this.ctx = null;
    this.master = null;
    this.running = false;
    // Voices exist before any audio does, so pitch is always readable.
    this.voices = new Map(VOICES.map((spec) => [spec.key, { hz: spec.hz, currentHz: spec.hz, osc: null, shimmer: null }]));
  }

  get pitches() {
    const out = {};
    for (const [key, v] of this.voices) out[key] = v.currentHz;
    return out;
  }

  async start() {
    if (!this.ctx) this.build();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(1, now + 2.5);
    this.running = true;
  }

  async stop() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 1.2);
    this.running = false;
  }

  // tempo: 1 at aphelion, rising toward perihelion. Pitch scales with it.
  setTempo(key, tempo) {
    const v = this.voices.get(key);
    if (!v) return;
    v.currentHz = v.hz * tempo;
    if (!v.osc) return;
    const when = this.ctx.currentTime;
    v.osc.frequency.setTargetAtTime(v.currentHz, when, 0.08);
    v.shimmer.frequency.setTargetAtTime(v.currentHz, when, 0.08);
  }

  build() {
    const ctx = this.createContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.4;

    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.6;

    filter.connect(dry).connect(this.master);
    filter.connect(reverb).connect(wet).connect(this.master);
    this.master.connect(ctx.destination);

    for (const spec of VOICES) {
      const osc = ctx.createOscillator();
      osc.type = spec.wave;
      osc.frequency.value = spec.hz;
      const gain = ctx.createGain();
      gain.gain.value = spec.gain;
      // A slow, slightly detuned second oscillator gives each voice breath.
      const shimmer = ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.value = spec.hz;
      shimmer.detune.value = 6;
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.value = spec.gain * 0.35;

      osc.connect(gain).connect(filter);
      shimmer.connect(shimmerGain).connect(filter);
      osc.start();
      shimmer.start();

      const voice = this.voices.get(spec.key);
      voice.osc = osc;
      voice.shimmer = shimmer;
    }
  }
}
