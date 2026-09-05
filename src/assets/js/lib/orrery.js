// =============================================================================
// ORRERY
// WebGL2 renderer. Given display-space positions and a camera, draws the sky,
// the Sun, orbit paths, trails, planets, and the optional Kepler wedge.
// Refuses to know about time, AU, sound, or which planet is which. Every
// draw is driven by the frame object it is handed.
// =============================================================================

const SKY_VERT = `#version 300 es
in vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`;

const SKY_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uDrift;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
vec3 stars(vec2 uv, float density, float size, float t) {
  vec2 g = floor(uv), f = fract(uv);
  float h = hash(g);
  if (h > density) return vec3(0.0);
  vec2 c = 0.15 + 0.7 * vec2(hash(g + 1.3), hash(g + 7.1));
  float d = length(f - c);
  float twinkle = 0.75 + 0.25 * sin(t * (0.6 + h * 2.5) + h * 40.0);
  float s = smoothstep(size, 0.0, d) * twinkle;
  float warm = hash(g + 3.7);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), warm);
  return s * tint * (0.5 + h / density);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 p = uv + uDrift;

  vec3 col = vec3(0.020, 0.020, 0.040);

  // Dust and faint nebula
  float n1 = fbm(p * 1.6 + vec2(3.1, 1.7));
  float n2 = fbm(p * 3.4 - vec2(1.3, 5.2) + n1 * 0.6);
  vec3 indigo = vec3(0.10, 0.09, 0.24);
  vec3 dust = vec3(0.24, 0.16, 0.09);
  col += indigo * smoothstep(0.45, 0.8, n1) * 0.55;
  col += dust * smoothstep(0.55, 0.85, n2) * 0.35;

  // Stars in three layers
  col += stars(p * 140.0, 0.045, 0.055, uTime) * 0.9;
  col += stars(p * 70.0 + 11.0, 0.03, 0.07, uTime) * 1.1;
  col += stars(p * 28.0 + 41.0, 0.012, 0.09, uTime) * 1.5;

  // Vignette
  float v = 1.0 - dot(uv, uv) * 0.55;
  col *= clamp(v, 0.0, 1.0);

  outColor = vec4(col, 1.0);
}`;

const RIBBON_VERT = `#version 300 es
in vec3 aPos;
in vec3 aPrev;
in vec3 aNext;
in float aSide;
in float aAlpha;
uniform mat4 uVP;
uniform vec2 uRes;
uniform float uWidth;
uniform float uTaper;
out float vAlpha;
out float vSide;

vec2 toScreen(vec4 clip) { return clip.xy / clip.w * uRes * 0.5; }

void main() {
  vec4 cp = uVP * vec4(aPos, 1.0);
  vec4 cprev = uVP * vec4(aPrev, 1.0);
  vec4 cnext = uVP * vec4(aNext, 1.0);
  vec2 p = toScreen(cp), pp = toScreen(cprev), pn = toScreen(cnext);
  vec2 d1 = p - pp, d2 = pn - p;
  vec2 dir = vec2(0.0);
  if (length(d1) > 0.0001) dir += normalize(d1);
  if (length(d2) > 0.0001) dir += normalize(d2);
  if (length(dir) < 0.0001) dir = vec2(1.0, 0.0);
  dir = normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  float w = uWidth * mix(1.0, aAlpha, uTaper);
  vec2 off = n * aSide * w;
  gl_Position = vec4((p + off) / (uRes * 0.5) * cp.w, cp.z, cp.w);
  vAlpha = aAlpha;
  vSide = aSide;
}`;

const RIBBON_FRAG = `#version 300 es
precision highp float;
in float vAlpha;
in float vSide;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  float edge = 1.0 - abs(vSide);
  float a = smoothstep(0.0, 0.6, edge) * vAlpha * uColor.a;
  outColor = vec4(uColor.rgb, a);
}`;

const POINT_VERT = `#version 300 es
in vec3 aPos;
uniform mat4 uVP;
uniform vec2 uRes;
uniform float uSize;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = min(220.0, uSize * (uRes.y / 900.0) * 320.0 / gl_Position.w);
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uPulse;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float core = smoothstep(0.26, 0.14, d);
  float halo = exp(-d * d * 4.0) * 0.6;
  float ring = smoothstep(0.02, 0.0, abs(d - 0.40)) * uPulse * 0.7;
  vec3 col = uColor * (halo + ring) + vec3(1.0) * core;
  outColor = vec4(col, halo + core + ring);
}`;

const SUN_VERT = `#version 300 es
in vec2 aCorner;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uSize;
out vec2 vUv;
void main() {
  vec3 center = (uView * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 pos = center + vec3(aCorner * uSize, 0.0);
  gl_Position = uProj * vec4(pos, 1.0);
  vUv = aCorner;
}`;

const SUN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 9.0; a *= 0.5; }
  return v;
}

void main() {
  float d = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  float t = uTime * 0.12;

  // Disc with granulation
  float grain = fbm(vUv * 9.0 + vec2(t * 0.7, -t * 0.4));
  float disc = smoothstep(0.30, 0.27, d);
  vec3 discCol = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.97, 0.85), grain);

  // Corona: radial streaks driven by angular noise
  float streak = fbm(vec2(ang * 2.2, d * 4.0 - t * 0.8));
  float corona = exp(-(d - 0.27) * 5.5) * (0.55 + 0.9 * streak);
  corona *= smoothstep(0.27, 0.30, d);
  float glow = exp(-d * d * 3.2) * 0.55;

  vec3 col = discCol * disc + vec3(1.0, 0.72, 0.32) * corona + vec3(1.0, 0.86, 0.6) * glow;
  float a = clamp(disc + corona + glow, 0.0, 1.0);
  outColor = vec4(col, a);
}`;

const FLAT_VERT = `#version 300 es
in vec3 aPos;
uniform mat4 uVP;
void main() { gl_Position = uVP * vec4(aPos, 1.0); }`;

const FLAT_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function program(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(p, i);
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { handle: p, uniforms };
}

// Pack a polyline into the ribbon vertex layout:
// pos(3) prev(3) next(3) side(1) alpha(1) = 11 floats, two vertices per point.
function packRibbon(points, alphaAt, closed) {
  const n = points.length;
  const out = new Float32Array(n * 2 * 11);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const next = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
    const alpha = alphaAt(i, n);
    for (const side of [-1, 1]) {
      out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2];
      out[o++] = prev[0]; out[o++] = prev[1]; out[o++] = prev[2];
      out[o++] = next[0]; out[o++] = next[1]; out[o++] = next[2];
      out[o++] = side;
      out[o++] = alpha;
    }
  }
  return out;
}

export default class Orrery {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;

    this.sky = program(gl, SKY_VERT, SKY_FRAG);
    this.ribbon = program(gl, RIBBON_VERT, RIBBON_FRAG);
    this.point = program(gl, POINT_VERT, POINT_FRAG);
    this.sun = program(gl, SUN_VERT, SUN_FRAG);
    this.flat = program(gl, FLAT_VERT, FLAT_FRAG);

    this.quad = this.makeQuad();
    this.paths = new Map();
    this.trailBuffer = gl.createBuffer();
    this.trailVao = this.makeRibbonVao(this.trailBuffer);
    this.pointBuffer = gl.createBuffer();
    this.flatBuffer = gl.createBuffer();
    this.pointVao = this.makeFlatVao(this.point.handle, this.pointBuffer);
    this.flatVao = this.makeFlatVao(this.flat.handle, this.flatBuffer);

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  makeQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.sky, this.sun]) {
      const loc = gl.getAttribLocation(p.handle, "aCorner");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  makeRibbonVao(buffer) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = 11 * 4;
    const attrs = [["aPos", 3, 0], ["aPrev", 3, 12], ["aNext", 3, 24], ["aSide", 1, 36], ["aAlpha", 1, 40]];
    for (const [name, size, offset] of attrs) {
      const loc = gl.getAttribLocation(this.ribbon.handle, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  makeFlatVao(handle, buffer) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const loc = gl.getAttribLocation(handle, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  // paths: [{ key, points: [[x,y,z], ...] }] in display units, closed loops.
  setPaths(paths) {
    const gl = this.gl;
    for (const { key, points } of paths) {
      const data = packRibbon(points, () => 1, true);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.paths.set(key, { buffer, vao: this.makeRibbonVao(buffer), count: points.length * 2 });
    }
  }

  resize(dpr) {
    const { canvas, gl } = this;
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    return [w, h];
  }

  // frame: {
  //   time, dpr, camera: { view, projection, viewProjection, azimuth, elevation },
  //   planets: [{ key, pos: [x,y,z], color: [r,g,b], size, trail: [[x,y,z],...], pulse }],
  //   focus: null | { key, emptyFocus: [x,y,z], axis: [[x,y,z],[x,y,z]], sweep: bool },
  // }
  render(frame) {
    const gl = this.gl;
    const [w, h] = this.resize(frame.dpr);
    const cam = frame.camera;

    // Sky
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.useProgram(this.sky.handle);
    gl.uniform2f(this.sky.uniforms.uRes, w, h);
    gl.uniform1f(this.sky.uniforms.uTime, frame.time);
    gl.uniform2f(this.sky.uniforms.uDrift, cam.azimuth * 0.12, cam.elevation * 0.08);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Orbit paths
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.ribbon.handle);
    gl.uniformMatrix4fv(this.ribbon.uniforms.uVP, false, cam.viewProjection);
    gl.uniform2f(this.ribbon.uniforms.uRes, w, h);
    gl.uniform1f(this.ribbon.uniforms.uTaper, 0);
    for (const planet of frame.planets) {
      const path = this.paths.get(planet.key);
      if (!path) continue;
      const focused = frame.focus && frame.focus.key === planet.key;
      gl.uniform1f(this.ribbon.uniforms.uWidth, (focused ? 1.4 : 1.0) * frame.dpr);
      const [r, g, b] = planet.color;
      gl.uniform4f(this.ribbon.uniforms.uColor, r, g, b, focused ? 0.55 : 0.18);
      gl.bindVertexArray(path.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, path.count);
    }

    // Kepler wedge and ellipse geometry for the focused planet
    if (frame.focus) this.drawFocus(frame, w, h);

    // Sun
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.sun.handle);
    gl.uniformMatrix4fv(this.sun.uniforms.uView, false, cam.view);
    gl.uniformMatrix4fv(this.sun.uniforms.uProj, false, cam.projection);
    // Mostly constant on screen, with a little more presence from far away.
    gl.uniform1f(this.sun.uniforms.uSize, 0.06 + 0.042 * cam.distance);
    gl.uniform1f(this.sun.uniforms.uTime, frame.time);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Trails
    gl.useProgram(this.ribbon.handle);
    gl.uniform1f(this.ribbon.uniforms.uTaper, 1);
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer);
    for (const planet of frame.planets) {
      if (planet.trail.length < 2) continue;
      const data = packRibbon(planet.trail, (i, n) => Math.pow(i / (n - 1), 1.6), false);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.uniform1f(this.ribbon.uniforms.uWidth, 2.2 * frame.dpr * planet.size);
      const [r, g, b] = planet.color;
      gl.uniform4f(this.ribbon.uniforms.uColor, r, g, b, 0.7);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, planet.trail.length * 2);
    }

    // Planets
    gl.useProgram(this.point.handle);
    gl.uniformMatrix4fv(this.point.uniforms.uVP, false, cam.viewProjection);
    gl.uniform2f(this.point.uniforms.uRes, w, h);
    gl.bindVertexArray(this.pointVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    for (const planet of frame.planets) {
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.pos), gl.DYNAMIC_DRAW);
      gl.uniform1f(this.point.uniforms.uSize, planet.size);
      gl.uniform1f(this.point.uniforms.uPulse, planet.pulse || 0);
      gl.uniform3fv(this.point.uniforms.uColor, planet.color);
      gl.drawArrays(gl.POINTS, 0, 1);
    }
  }

  drawFocus(frame, w, h) {
    const gl = this.gl;
    const { focus } = frame;
    const planet = frame.planets.find((p) => p.key === focus.key);
    if (!planet) return;
    const [r, g, b] = planet.color;

    gl.useProgram(this.flat.handle);
    gl.uniformMatrix4fv(this.flat.uniforms.uVP, false, frame.camera.viewProjection);
    gl.bindVertexArray(this.flatVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.flatBuffer);

    if (focus.sweep && planet.trail.length > 2) {
      // Triangle fan from the Sun through the trail: the area swept.
      const fan = [0, 0, 0];
      for (const p of planet.trail) fan.push(p[0], p[1], p[2]);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fan), gl.DYNAMIC_DRAW);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.uniform4f(this.flat.uniforms.uColor, r, g, b, 0.16);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, planet.trail.length + 1);
      // Radius vector, Sun to planet
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, ...planet.pos]), gl.DYNAMIC_DRAW);
      gl.uniform4f(this.flat.uniforms.uColor, r, g, b, 0.8);
      gl.drawArrays(gl.LINES, 0, 2);
    }

    if (focus.axis) {
      // Major axis through both foci, and a cross at the empty focus.
      const [a1, a2] = focus.axis;
      const f = focus.emptyFocus;
      const s = 0.035 * frame.camera.distance;
      const lines = [
        ...a1, ...a2,
        f[0] - s, f[1] - s, f[2], f[0] + s, f[1] + s, f[2],
        f[0] - s, f[1] + s, f[2], f[0] + s, f[1] - s, f[2],
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform4f(this.flat.uniforms.uColor, 0.93, 0.87, 0.72, 0.45);
      gl.drawArrays(gl.LINES, 0, 2);
      gl.uniform4f(this.flat.uniforms.uColor, 0.93, 0.87, 0.72, 0.95);
      gl.drawArrays(gl.LINES, 2, 4);
    }
  }
}
