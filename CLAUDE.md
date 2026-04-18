# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Two artefacts describing the "BBR" light-rail / tram network, with different scopes:

- **`src/bbr.rkt`** — Racket graph model, topology only. Lines (`a1`, `a2`, `b`, `c1`, `c2`) are lists of stop symbols, unioned into a single undirected graph with per-edge line labels.
- **`data/bbr-network.json`** — JSON description intended to feed a visual train simulation. Carries the same topology *plus* simulation data: per-segment track counts, per-stop platform counts, junctions where lines meet outside a stop, per-line headways and colours, and global timing constants.

The JSON is richer than the Racket source, so edits to `src/bbr.rkt` don't automatically flow into the JSON — reconcile by hand. Generated artefacts live in `images/` (`graph.dot`, `graph.png`).

## Simulator app (`app/`)

Browser-based visual simulation built with vanilla TypeScript + Vite + D3. Reads `data/bbr-network.json` as its sole source of truth (never duplicates network constants in code).

```sh
cd app
npm install       # first time only
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # tsc + Vite production build → app/dist/
```

**Source layout** (`app/src/`):
- `types.ts` — all TypeScript interfaces (JSON schema types + sim types)
- `network.ts` — parse JSON, build derived structures; key export: `buildNetwork()`, `getLegSegments()`, `otherEndpoint()`
- `layout.ts` — d3-force run-once headless layout → `Positions` map
- `sim.ts` — `SimState` + `tickSim(state, network, dtWall)` tick loop; train state machine; block and platform occupancy
- `render.ts` — static SVG (segments with per-line colour offsets, stop/junction nodes) + `renderFrame()` for animated train markers
- `ui.ts` — play/pause/speed controls, sim clock, train inspector panel, stop arrivals panel
- `main.ts` — entry: wires all modules together, RAF loop

**Key invariant**: `vite.config.ts` sets `server.fs.allow: ['.', '..']` so the dev server can resolve `../../data/bbr-network.json` from `app/src/main.ts`.

**Train state machine**: each train holds exactly one resource (a segment block or a stop platform) at a time. A train parks at `progress = 0.999` when the next resource is full rather than releasing its current one. Junctions are pure track nodes (no platform capacity).

## Racket commands

Run from `src/` (the `write-graph` output path is relative: `../images/graph.dot`):

```sh
# Run the rackunit test submodule
raco test bbr.rkt

# Load into a REPL to interact with the graph, then (write-graph bbr)
racket -it bbr.rkt
```

`write-graph` shells out to `/opt/homebrew/bin/fdp` (Graphviz, installed via Homebrew) to render the DOT file to PNG. If Graphviz isn't at that path, the shell-out will silently do nothing — the call is `system "/opt/homebrew/bin/fdp -Tpng -O ./graph.dot"` where `system` is passed as a value rather than applied, so it is effectively a no-op. Fixing this requires wrapping the call in parens.

### Package dependencies

The file `require`s several non-built-in packages. Install with `raco pkg install` if missing:

- `threading` (for `~>`, etc.)
- `graph` and `graph-ext` (graph data structure + extensions; `graph-ext` provides `line-set!` / edge-property mutators used here)
- `lens` and `lens/data/struct`
- `data/maybe`

## Architecture notes

- **Graph construction.** `add-line! G label stops` walks `adjacent-pairs` of a stop list, calls `add-edge!` for each pair, and appends `label` to the `line` edge property in both directions via `add-line-label!`. Adding a stop to multiple lines just produces multiple labels on the shared edge.
- **Edge property `line`.** Declared with `define-edge-property bbr line` *after* `bbr` is created but *before* `add-line!` calls — this is what gives edges their `line` accessor/mutator. `line-set!` is used to overwrite the label list; reading uses `(line src dest #:default '())`.
- **Vertex property `attr`.** Declared with `define-vertex-property bbr attr #:init (stop)` *after* all lines are added, so every vertex inherits a fresh `stop` struct instance. Declaring it earlier would miss vertices created by later `add-line!` calls.
- **`vertex-property-set!`** uses `eval` at runtime to build a `struct-lens` for a dynamically-named field, because `struct-lens` hard-codes field names at macro-expansion time. This is the reason `eval` appears here — don't "clean it up" without understanding that constraint.
- **`stop` struct** is currently a placeholder with no fields. The commented-out test references `stop-capacity`, indicating the intended direction is to add fields (capacity, etc.) and mutate them via `vertex-property-set!`.

## Simulation network description (`data/bbr-network.json`)

### Schema

- `simulation` — uniform timing constants in seconds: `segment-travel-time-seconds`, `dwell-time-seconds`, `turnaround-time-seconds`.
- `lines[]` — `id`, ordered `stops`, `terminii`, `headway-seconds`, `colour`.
- `stops[]` — `id`, `lines` (which lines stop here), `platforms` (≥1; >1 ⇒ passing loop / turnaround / multi-line dwell).
- `junctions[]` — track nodes where lines meet *outside* a stop. `id` plus optional `connects` (adjacent stops/junctions). Junction IDs are disjoint from stop IDs.
- `segments[]` — first-class inter-node edges. `endpoints` (unordered; either may be a stop or a junction), `lines` (every line using this segment), `tracks` (`1` = single-track block, `2` = parallel tracks).
- `interchanges` / `terminii` — flat stop-id lists for quick reference.

### Modelling rules worth knowing before editing

- **Block-per-segment signalling.** `tracks: 1` ⇒ one train at a time, either direction. Where lines share physical track, the segment is listed **once** with all sharing line IDs — trains from those lines contend for the same block. Don't duplicate a segment per line.
- **Junctions aren't stops.** A line's `stops` list skips its junctions. To reconstruct the physical path between two consecutive stops, walk `segments` via intermediate junctions (e.g. `a1` runs `crescent → junction-1 → federal-park`, not a direct edge).
- **Uniform travel time.** `simulation.segment-travel-time-seconds` applies to every segment — no per-segment overrides by design. Promote to a per-segment field only if distance realism matters.
- **No coordinates.** Layout is computed at runtime.
- **Platform defaults.** Named interchanges = 3, single-line terminii = 2, everything else = 1. Placeholders; revise when the simulator reveals bottlenecks.

### Invariants to re-check after edits

- Every consecutive pair in each line's `stops` reconstructs as a path through `segments` that traverses only junctions (not other stops) and where every segment in the path carries that line's id.
- Every `segments.endpoints` id is declared in `stops` or `junctions`; those sets are disjoint.
- Every `junctions.connects` entry has a matching segment.
- `platforms ≥ 1`, `tracks ≥ 1`, `headway-seconds > 0`, `simulation.*` positive.

## Conventions

- Haskell-style type signatures in comments (e.g. `;; adjacent-pairs :: List a -> List (a a)`).
- Mutating graph ops end in `!` (`add-line!`, `add-line-label!`, `vertex-property-set!`).
- Stops are symbols (`'crescent`, `'federal-park`, ...), lines are symbols (`'a1`, `'b`, ...).
