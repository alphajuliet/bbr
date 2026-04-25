# SVG-Based Geographic Layout Design

## Problem

The current d3-force layout (`app/src/layout.ts`) produces unattractive, non-geographic node placement. A hand-drawn schematic (`images/bbr.svg`) already encodes the intended geographic positions of all stops.

## Goal

Replace the force-directed layout with positions extracted from `bbr.svg`, giving a map that matches the intended schematic.

## Network change: add Foley Park

`foley-park` is a stop present in `bbr.svg` but missing from `bbr-network.json`. It belongs on line a2 between `st-james` and `colbourne`.

Changes to `bbr-network.json`:
- Add stop: `{ "id": "foley-park", "lines": ["a2"], "platforms": 1 }`
- Update line a2 stops: insert `foley-park` between `st-james` and `colbourne`
- Remove segment `st-james ↔ colbourne`
- Add segment `st-james ↔ foley-park` (lines: a2, tracks: 1)
- Add segment `foley-park ↔ colbourne` (lines: a2, tracks: 1)

## Extraction script (`scripts/extract-positions.py`)

One-time Python script (stdlib only). Writes `x`/`y` back into `bbr-network.json`.

### Steps

1. Parse `images/bbr.svg` with `xml.etree.ElementTree`.
2. **Stop marker positions** — from layer `inkscape:label="stops"`: extract geometric centre of each path element.
   - Circles (`m cx,cy c 0,-r ...`): centre = `(cx + r, cy)`
   - Rounded rectangles (`m x,y h w c ...`): centre = `(x + w/2, y + corner_r)`
   - Rotated rectangles (diamond terminus shapes): compute midpoint of the move vector
3. **Label positions** — from layer `inkscape:label="stop-names"`: extract `inkpad:text` and actual screen position.
   - No transform: use element `x`, `y` directly
   - `transform="rotate(θ)"`: apply 2D rotation matrix to `(x, y)`
4. **Match** each marker centre to its nearest label by Euclidean distance. Warn on any unmatched label.
5. **Name → ID mapping**: lowercase + spaces-to-hyphens (e.g. "Foley Park" → "foley-park").
6. **Junction inference** (two passes):
   - Pass 1: place each junction at the average position of its connected *stops* (skip adjacent junctions)
   - Pass 2: average with any adjacent junctions now placed
7. Write `"x"` and `"y"` into each stop and junction object in `bbr-network.json`. Coordinates are in raw SVG viewport units (0–1190 × 0–842).

## JSON schema change

Each stop and junction gains two optional fields:

```json
{ "id": "crescent", "lines": [...], "platforms": 3, "x": 358.6, "y": 153.9 }
```

Coordinates are in SVG viewport units. No normalisation — `layout.ts` will scale to the canvas.

## `app/src/layout.ts` change

`computeLayout(network, width, height)`:
- If every stop and junction in the network has `x`/`y` set, skip the force simulation entirely and return a `Positions` map scaled from SVG space (1190 × 842) to canvas space (`width × height`) with uniform padding.
- If any node is missing coordinates, fall back to the existing d3-force simulation (safety net; should not occur after the script runs).
