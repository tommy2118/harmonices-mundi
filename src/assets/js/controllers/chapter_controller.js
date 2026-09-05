import { Controller } from "@hotwired/stimulus";

/**
 * Chapter Controller
 *
 * A section of the essay. When it straddles the vertical middle of the
 * viewport it announces the camera pose, clock rate, and focus it wants.
 * It refuses to know who is listening.
 *
 * The midpoint test, rather than an intersection ratio, keeps this correct
 * for sections taller than the viewport and guarantees only one chapter is
 * active at a time.
 *
 *   <section data-controller="chapter"
 *            data-chapter-rate-value="10"
 *            data-chapter-distance-value="4.5"
 *            data-chapter-elevation-value="70"
 *            data-chapter-focus-value="mars"
 *            data-chapter-sweep-value="false"
 *            data-chapter-layout-value="aside">
 */
export default class extends Controller {
  static values = {
    rate: Number,
    distance: Number,
    elevation: Number,
    focus: String,
    sweep: Boolean,
    layout: { type: String, default: "aside" },
  };

  connect() {
    this.active = false;
    this.pending = false;
    this.onScroll = () => this.schedule();
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onScroll, { passive: true });
    this.schedule();
  }

  disconnect() {
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onScroll);
  }

  schedule() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.check();
    });
  }

  check() {
    const rect = this.element.getBoundingClientRect();
    const mid = window.innerHeight / 2;
    const contains = rect.top <= mid && rect.bottom > mid;
    if (contains === this.active) return;
    this.active = contains;
    this.element.classList.toggle("is-active", contains);
    if (contains) this.announce();
  }

  announce() {
    window.dispatchEvent(
      new CustomEvent("orrery:chapter", {
        detail: {
          rate: this.rateValue,
          distance: this.distanceValue,
          elevation: this.elevationValue,
          focus: this.focusValue || null,
          sweep: this.sweepValue,
          layout: this.layoutValue,
        },
      })
    );
  }
}
