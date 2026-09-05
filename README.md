# Harmonices Mundi

Kepler said the planets sing. This is the performance.

A single-page site: a WebGL2 orrery runs the six planets Kepler knew on their
true elliptical orbits, and the Web Audio API gives each one a voice whose
pitch follows its angular velocity, the way Kepler wrote it in Book V of
*Harmonices Mundi* (1619). Scrolling reads a four-chapter essay. Each chapter
takes over the camera and the clock.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:8080. `npm run build` writes `dist/` for GitHub
Pages; `npm test` runs the orbital-mechanics tests, including six that assert
Kepler's intervals fall out of the eccentricities.

## How it is built

| Piece | Where | What it refuses to know |
|-------|-------|-------------------------|
| Ephemeris | `src/assets/js/lib/ephemeris.js` | Pixels, sound, the DOM. Pure math: JPL mean elements at J2000, Kepler's equation by Newton's method. |
| Clock | `src/assets/js/lib/clock.js` | What time is for. Owns simulated days and an eased rate. |
| Camera | `src/assets/js/lib/camera.js` | What it is looking at. Spherical orbit, eased pose, off-center projection so text can sit beside the Sun. |
| Choir | `src/assets/js/lib/choir.js` | Orbits. Six voices told a tempo, gliding pitch to match. AudioContext is injected. |
| Orrery | `src/assets/js/lib/orrery.js` | Time, AU, which planet is which. WebGL2 renderer: sky, Sun, orbit ribbons, trails, Kepler wedge. |
| Stage | `src/assets/js/lib/stage.js` | Maps AU to display units (r^0.6) and holds the palette. |
| Orrery controller | `src/assets/js/controllers/orrery_controller.js` | The one joint. Frame loop; passes messages between the pieces above. |
| Chapter controller | `src/assets/js/controllers/chapter_controller.js` | Who is listening. Announces a pose when it straddles the viewport midpoint. |

Distances are compressed so Mercury and Saturn share a screen. Directions,
timing, and the shape of every ellipse are true to the ephemeris.

## Stack

Eleventy 3, Tailwind 4, Stimulus 3, per the house static site spec. No
bundler; Stimulus loads from an import map. Fonts are Fraunces and JetBrains
Mono from Google Fonts.

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and
publishes `dist/` to GitHub Pages. `pathPrefix` in `eleventy.config.js`
assumes the repository is named `harmonices-mundi`.
