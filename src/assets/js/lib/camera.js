// =============================================================================
// CAMERA
// A spherical orbit camera around the origin. Holds a desired pose and eases
// toward it. Drag input nudges azimuth and elevation. Refuses to know what
// it is looking at.
// =============================================================================

import { mat4 } from "./mat4.js";

export default class Camera {
  constructor() {
    this.distance = 12;
    this.azimuth = 0.6;
    this.elevation = 0.6;
    this.shiftX = 0;
    this.shiftY = 0;
    this.target = { distance: 12, elevation: 0.6, shiftX: 0, shiftY: 0 };
    this.autoSpin = 0.03;   // radians per second
    this.dragging = false;
    this.aspect = 1;
    this.view = mat4.create();
    this.projection = mat4.create();
    this.viewProjection = mat4.create();
    this.eye = [0, 0, 0];
  }

  // shiftX / shiftY move the whole scene in normalized device coordinates
  // (-1..1) so text can sit beside the Sun instead of on top of it.
  setPose({ distance, elevation, shiftX, shiftY }) {
    if (distance !== undefined) this.target.distance = distance;
    if (elevation !== undefined) this.target.elevation = elevation;
    if (shiftX !== undefined) this.target.shiftX = shiftX;
    if (shiftY !== undefined) this.target.shiftY = shiftY;
  }

  drag(dx, dy) {
    this.azimuth -= dx * 0.005;
    this.target.elevation = clamp(this.target.elevation + dy * 0.005, 0.05, 1.5);
  }

  zoom(factor) {
    this.target.distance = clamp(this.target.distance * factor, 0.8, 30);
  }

  update(dt) {
    const k = Math.min(1, dt * 1.6);
    this.distance += (this.target.distance - this.distance) * k;
    this.elevation += (this.target.elevation - this.elevation) * k;
    this.shiftX += (this.target.shiftX - this.shiftX) * k;
    this.shiftY += (this.target.shiftY - this.shiftY) * k;
    if (!this.dragging) this.azimuth += this.autoSpin * dt;

    const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
    this.eye = [
      this.distance * ce * Math.cos(this.azimuth),
      this.distance * ce * Math.sin(this.azimuth),
      this.distance * se,
    ];
    mat4.lookAt(this.view, this.eye, [0, 0, 0], [0, 0, 1]);
    mat4.perspective(this.projection, 38 * (Math.PI / 180), this.aspect, 0.05, 200);
    // Asymmetric frustum: these terms shift clip space uniformly at every depth.
    this.projection[8] = -this.shiftX;
    this.projection[9] = -this.shiftY;
    mat4.multiply(this.viewProjection, this.projection, this.view);
  }
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
