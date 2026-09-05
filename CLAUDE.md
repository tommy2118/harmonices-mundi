# Harmonices Mundi — AI Pairing Context

A one-page site that performs Kepler's *Harmonices Mundi*: a WebGL2 orrery on
true orbits, each planet voiced by its own angular velocity. Built to the
house static site spec (Eleventy 3, Tailwind 4, Stimulus 3).

## Body plan

Read `README.md` for the table of parts and what each refuses to know. The
short version: `lib/` holds pure objects with injected collaborators;
`controllers/orrery_controller.js` is the only joint; chapters talk to it
only through the `orrery:chapter` window event.

Keep it that way. Do not let the renderer learn about time, the choir learn
about orbits, or a chapter learn who is listening.

## Working here

- `npm test` before any change to `lib/ephemeris.js`. The Kepler-interval
  tests are the contract; if they fail, the music is wrong.
- Visual work is verified in the browser, not by reasoning. The renderer is
  driven by `requestAnimationFrame`, which pauses in hidden tabs.
- Chapter poses (rate, distance, elevation, focus, sweep, layout) live as
  data attributes in `src/index.njk`. Tune composition there first.
- Mobile gets 1.5x camera distance and a vertical shift; see `shiftFor` in
  the orrery controller.
- Reduced motion: camera auto-spin off, clock rate capped.

## Not yet

- Local git only; no GitHub remote yet. Add one before the deploy workflow can run.
- Audio only starts on the Listen button (browser gesture rule).
