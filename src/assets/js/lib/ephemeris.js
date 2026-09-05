// =============================================================================
// EPHEMERIS
// Pure orbital mechanics. Takes a planet and a time, returns a position.
// Refuses to know about pixels, cameras, sound, or the DOM.
//
// Elements are JPL's mean Keplerian elements at J2000 (valid 1800-2050).
// Only the mean longitude is advanced with time; the secular drift in the
// other elements is far below anything this site can show.
// =============================================================================

const DEG = Math.PI / 180;

// a: semi-major axis (AU); e: eccentricity; i: inclination (deg)
// L: mean longitude at J2000 (deg); Lrate: deg per Julian century
// peri: longitude of perihelion (deg); node: longitude of ascending node (deg)
export const PLANETS = [
  { key: "mercury", name: "Mercury", a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.2503235, Lrate: 149472.67411175, peri: 77.45779628, node: 48.33076593 },
  { key: "venus",   name: "Venus",   a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.9790995, Lrate: 58517.81538729,  peri: 131.60246718, node: 76.67984255 },
  { key: "earth",   name: "Earth",   a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, Lrate: 35999.37244981, peri: 102.93768193, node: 0.0 },
  { key: "mars",    name: "Mars",    a: 1.52371034, e: 0.0933941,  i: 1.84969142, L: -4.55343205, Lrate: 19140.30268499,  peri: -23.94362959, node: 49.55953891 },
  { key: "jupiter", name: "Jupiter", a: 5.202887,   e: 0.04838624, i: 1.30439695, L: 34.39644051, Lrate: 3034.74612775,   peri: 14.72847983, node: 100.47390909 },
  { key: "saturn",  name: "Saturn",  a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, Lrate: 1222.49362201,   peri: 92.59887831, node: 113.66242448 },
];

export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

export function daysSinceJ2000(date) {
  return (date.getTime() - J2000_MS) / 86400000;
}

export function dateFromDays(days) {
  return new Date(J2000_MS + days * 86400000);
}

// Kepler's equation: M = E - e sin E. Solved for E by Newton's method.
export function solveKepler(M, e, tolerance = 1e-10) {
  let E = e < 0.8 ? M : Math.PI;
  for (let n = 0; n < 30; n++) {
    const f = E - e * Math.sin(E) - M;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) break;
  }
  return E;
}

function wrapRadians(x) {
  const twoPi = 2 * Math.PI;
  return x - twoPi * Math.floor((x + Math.PI) / twoPi);
}

// Orbital period in days, from the mean motion. This is the same number the
// simulation advances by, so the drawn path closes exactly.
export function periodDays(planet) {
  return (360 / planet.Lrate) * 36525;
}

// Ratio of angular velocity at perihelion to angular velocity at aphelion.
// From the second law, angular velocity goes as 1/r^2, so the ratio is
// ((1+e)/(1-e))^2. This is the number Kepler heard as an interval.
export function extremeAngularRatio(planet) {
  return Math.pow((1 + planet.e) / (1 - planet.e), 2);
}

// Heliocentric ecliptic position at `days` since J2000.
// Returns { x, y, z } in AU, plus r (distance) and the aphelion-relative
// angular velocity ratio `tempo` in [1, extremeAngularRatio].
export function positionAt(planet, days) {
  const T = days / 36525;
  const L = (planet.L + planet.Lrate * T) * DEG;
  const peri = planet.peri * DEG;
  const node = planet.node * DEG;
  const inc = planet.i * DEG;
  const omega = peri - node;
  const M = wrapRadians(L - peri);
  const E = solveKepler(M, planet.e);

  const xp = planet.a * (Math.cos(E) - planet.e);
  const yp = planet.a * Math.sqrt(1 - planet.e * planet.e) * Math.sin(E);

  const cosO = Math.cos(omega), sinO = Math.sin(omega);
  const cosN = Math.cos(node), sinN = Math.sin(node);
  const cosI = Math.cos(inc), sinI = Math.sin(inc);

  const x = (cosO * cosN - sinO * sinN * cosI) * xp + (-sinO * cosN - cosO * sinN * cosI) * yp;
  const y = (cosO * sinN + sinO * cosN * cosI) * xp + (-sinO * sinN + cosO * cosN * cosI) * yp;
  const z = (sinO * sinI) * xp + (cosO * sinI) * yp;

  const r = Math.sqrt(x * x + y * y + z * z);
  const aphelion = planet.a * (1 + planet.e);
  const tempo = Math.pow(aphelion / r, 2);

  return { x, y, z, r, tempo };
}

// The full orbit as `steps` points, for drawing the path.
export function orbitPath(planet, steps = 256) {
  const period = periodDays(planet);
  const points = [];
  for (let s = 0; s <= steps; s++) {
    points.push(positionAt(planet, (s / steps) * period));
  }
  return points;
}

// The empty focus of the ellipse: the Sun sits at one focus; the other is
// 2ae further along the major axis, on the aphelion side.
export function emptyFocus(planet) {
  // Find aphelion direction by sampling: the point of maximum r.
  const path = orbitPath(planet, 720);
  let far = path[0];
  for (const p of path) if (p.r > far.r) far = p;
  const scale = (2 * planet.a * planet.e) / far.r;
  return { x: far.x * scale, y: far.y * scale, z: far.z * scale };
}
