// =============================================================================
// CLOCK
// Owns simulated time (days since J2000) and how fast it runs. Refuses to
// know what the time is for. The rate eases toward a target so chapter
// changes glide instead of jump.
// =============================================================================

export default class Clock {
  constructor({ days = 0, rate = 20 } = {}) {
    this.days = days;
    this.rate = rate;          // simulated days per real second
    this.targetRate = rate;
    this.paused = false;
  }

  setRate(rate) {
    this.targetRate = rate;
  }

  tick(dtSeconds) {
    this.rate += (this.targetRate - this.rate) * Math.min(1, dtSeconds * 2);
    if (!this.paused) this.days += this.rate * dtSeconds;
    return this.days;
  }
}
