# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Racket model of the "BBR" light-rail / tram network as an undirected graph. Lines (`a1`, `a2`, `b`, `c1`, `c2`) are lists of stop symbols; each line is unioned into a single graph with a per-edge label recording which lines use that edge.

Single source file: `src/bbr.rkt`. Generated artefacts live in `images/` (`graph.dot`, `graph.png`).

## Commands

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

## Conventions

- Haskell-style type signatures in comments (e.g. `;; adjacent-pairs :: List a -> List (a a)`).
- Mutating graph ops end in `!` (`add-line!`, `add-line-label!`, `vertex-property-set!`).
- Stops are symbols (`'crescent`, `'federal-park`, ...), lines are symbols (`'a1`, `'b`, ...).
