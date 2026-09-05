import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  PLANETS,
  solveKepler,
  positionAt,
  periodDays,
  extremeAngularRatio,
  emptyFocus,
  daysSinceJ2000,
} from "../src/assets/js/lib/ephemeris.js";

const byKey = Object.fromEntries(PLANETS.map((p) => [p.key, p]));

describe("solveKepler", () => {
  test("satisfies M = E - e sin E across the eccentricities we use", () => {
    for (const e of [0, 0.0167, 0.0934, 0.2056, 0.6]) {
      for (let M = -Math.PI; M <= Math.PI; M += 0.37) {
        const E = solveKepler(M, e);
        assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-9, `e=${e} M=${M}`);
      }
    }
  });
});

describe("positionAt", () => {
  test("keeps every planet between its perihelion and aphelion", () => {
    for (const planet of PLANETS) {
      const period = periodDays(planet);
      for (let k = 0; k < 40; k++) {
        const { r } = positionAt(planet, (k / 40) * period + 1234);
        assert.ok(r >= planet.a * (1 - planet.e) - 1e-6, `${planet.key} below perihelion`);
        assert.ok(r <= planet.a * (1 + planet.e) + 1e-6, `${planet.key} above aphelion`);
      }
    }
  });

  test("returns to the same place after one period", () => {
    for (const planet of PLANETS) {
      const a = positionAt(planet, 500);
      const b = positionAt(planet, 500 + periodDays(planet));
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3, planet.key);
    }
  });

  // Earth reaches perihelion in early January. On 2020-01-05 it was about
  // 0.9833 AU from the Sun.
  test("puts Earth near perihelion in early January", () => {
    const days = daysSinceJ2000(new Date(Date.UTC(2020, 0, 5)));
    const { r } = positionAt(byKey.earth, days);
    assert.ok(Math.abs(r - 0.9833) < 0.0005, `r=${r}`);
  });

  test("tempo is 1 at aphelion and the extreme ratio at perihelion", () => {
    const planet = byKey.mercury;
    let slowest = Infinity, fastest = -Infinity;
    const period = periodDays(planet);
    for (let k = 0; k < 2000; k++) {
      const { tempo } = positionAt(planet, (k / 2000) * period);
      slowest = Math.min(slowest, tempo);
      fastest = Math.max(fastest, tempo);
    }
    assert.ok(Math.abs(slowest - 1) < 1e-4);
    assert.ok(Math.abs(fastest - extremeAngularRatio(planet)) < 1e-3);
  });
});

describe("emptyFocus", () => {
  test("lies 2ae from the Sun", () => {
    for (const planet of PLANETS) {
      const f = emptyFocus(planet);
      const d = Math.hypot(f.x, f.y, f.z);
      assert.ok(Math.abs(d - 2 * planet.a * planet.e) < 1e-6, planet.key);
    }
  });
});

// Harmonices Mundi, Book V (1619). Kepler compared each planet's angular
// speed at perihelion and aphelion and wrote the ratio as an interval. The
// intervals fall out of the eccentricities alone, to within a few percent.
describe("Kepler's intervals", () => {
  const score = {
    saturn: [5, 4],   // major third
    jupiter: [6, 5],  // minor third
    mars: [3, 2],     // perfect fifth
    earth: [16, 15],  // semitone: mi, fa, mi
    venus: [25, 24],  // diesis
    mercury: [12, 5], // octave plus minor third
  };

  for (const [key, [num, den]] of Object.entries(score)) {
    test(`${key} sings ${num}:${den}`, () => {
      const computed = extremeAngularRatio(byKey[key]);
      const written = num / den;
      const cents = 1200 * Math.log2(computed / written);
      assert.ok(Math.abs(cents) < 80, `${key}: off by ${cents.toFixed(1)} cents`);
    });
  }
});
