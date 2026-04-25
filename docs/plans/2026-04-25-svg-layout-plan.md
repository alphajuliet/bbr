# SVG-Based Geographic Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace force-directed layout with stop positions extracted from `images/bbr.svg`, and add the missing `foley-park` stop.

**Architecture:** A one-time Python script reads SVG stop-marker geometry and text-label positions, matches them by proximity, maps display names to JSON IDs, and writes `x`/`y` fields into `bbr-network.json`. `layout.ts` then reads those fields and skips the force simulation entirely.

**Tech Stack:** Python 3 stdlib (`xml.etree.ElementTree`, `re`, `math`, `json`), pytest, TypeScript/d3

---

### Task 1: Add foley-park to bbr-network.json

**Files:**
- Modify: `data/bbr-network.json`

**Step 1: Add foley-park stop entry**

In `data/bbr-network.json`, add to the `stops` array (keep alphabetical order, after `federal-park`):
```json
{ "id": "foley-park", "lines": ["a2"], "platforms": 1 },
```

**Step 2: Insert foley-park into line a2's stop sequence**

In the `lines` array, find the `a2` entry. Change its `stops` from:
```json
["crescent","federal-park","tramsheds","harold-park","wigram","hegarty","st-james","colbourne","burton","blackwattle-bay"]
```
to:
```json
["crescent","federal-park","tramsheds","harold-park","wigram","hegarty","st-james","foley-park","colbourne","burton","blackwattle-bay"]
```

**Step 3: Replace the st-james↔colbourne segment**

In `segments`, remove:
```json
{ "endpoints": ["st-james", "colbourne"], "lines": ["a2"], "tracks": 1 },
```
Replace with two entries:
```json
{ "endpoints": ["st-james", "foley-park"],  "lines": ["a2"], "tracks": 1 },
{ "endpoints": ["foley-park", "colbourne"], "lines": ["a2"], "tracks": 1 },
```

**Step 4: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('data/bbr-network.json')); print('OK')"
```
Expected: `OK`

**Step 5: Commit**
```bash
git add data/bbr-network.json
git commit -m "Add foley-park stop to a2 line between st-james and colbourne"
```

---

### Task 2: Write tests for the extraction script

**Files:**
- Create: `scripts/test_extract_positions.py`

The production script doesn't exist yet — write failing tests first.

**Step 1: Create the test file**

```python
# scripts/test_extract_positions.py
import math
import pytest

# All imports from the script-under-test (will fail until Task 3 creates it)
from extract_positions import name_to_id, parse_m, path_center, label_screen_pos


def test_name_to_id_single_word():
    assert name_to_id("Franklyn") == "franklyn"

def test_name_to_id_two_words():
    assert name_to_id("Federal Park") == "federal-park"

def test_name_to_id_three_words():
    assert name_to_id("Blackwattle Bay") == "blackwattle-bay"

def test_name_to_id_strips_whitespace():
    assert name_to_id("  Booth  ") == "booth"


def test_parse_m_basic():
    d = "m 691.09,407.027 c 0,-1.628 1.32,-2.948 2.948,-2.948"
    assert parse_m(d) == pytest.approx((691.09, 407.027))

def test_parse_m_negative_coords():
    d = "m -125.98,684.99 c 0,-1.628 1.32,-2.948 2.948,-2.948"
    assert parse_m(d) == pytest.approx((-125.98, 684.99))


# Real path data from images/bbr.svg
CIRCLE_PATH = (
    "m 691.09,407.027 c 0,-1.628 1.32,-2.948 2.948,-2.948 1.628,0 2.947,1.32 2.947,2.948 "
    "0,1.628 -1.319,2.947 -2.947,2.947 -1.628,0 -2.948,-1.319 -2.948,-2.947 z"
)
RECT_PATH = (
    "m 708.621,333.329 h 19.53 c 1.54,0 2.789,1.249 2.789,2.789 v 0 "
    "c 0,1.54 -1.249,2.788 -2.789,2.788 h -19.53 c -1.54,0 -2.788,-1.248 -2.788,-2.788 "
    "v 0 c 0,-1.54 1.248,-2.789 2.788,-2.789 z"
)
DIAMOND_PATH = (
    "m 349.248,158.893 7.172,-7.505 c 1.112,-1.164 2.957,-1.206 4.121,-0.094 v 0 "
    "c 1.164,1.112 1.206,2.958 0.094,4.122 l -7.172,7.505 c -1.113,1.164 -2.958,1.206 "
    "-4.122,0.093 v 0 c -1.164,-1.112 -1.206,-2.957 -0.093,-4.121 z"
)

def test_path_center_circle():
    cx, cy = path_center(CIRCLE_PATH)
    assert cx == pytest.approx(691.09 + 2.948, abs=0.02)
    assert cy == pytest.approx(407.027, abs=0.02)

def test_path_center_rect():
    cx, cy = path_center(RECT_PATH)
    assert cx == pytest.approx(708.621 + 19.53 / 2, abs=0.02)
    assert cy == pytest.approx(333.329 + 2.789, abs=0.02)

def test_path_center_diamond():
    cx, cy = path_center(DIAMOND_PATH)
    assert cx == pytest.approx(349.248 + 7.172 / 2, abs=0.02)
    assert cy == pytest.approx(158.893 + (-7.505) / 2, abs=0.02)


class _FakeElem:
    """Minimal stand-in for xml.etree.ElementTree.Element."""
    def __init__(self, x, y, transform=''):
        self._attrs = {'x': str(x), 'y': str(y), 'transform': transform}
    def get(self, k, default=''):
        return self._attrs.get(k, default)

def test_label_screen_pos_no_transform():
    x, y = label_screen_pos(_FakeElem(100.5, 200.3))
    assert x == pytest.approx(100.5)
    assert y == pytest.approx(200.3)

def test_label_screen_pos_rotate_minus_45():
    # St James label from SVG: transform="rotate(-45)", x=-74.216545, y=736.14062
    x, y = label_screen_pos(_FakeElem(-74.216545, 736.14062, 'rotate(-45)'))
    angle = math.radians(-45)
    ex = -74.216545 * math.cos(angle) - 736.14062 * math.sin(angle)
    ey = -74.216545 * math.sin(angle) + 736.14062 * math.cos(angle)
    assert x == pytest.approx(ex, abs=0.01)
    assert y == pytest.approx(ey, abs=0.01)

def test_label_screen_pos_matrix_transform():
    # Bellevue Port uses matrix(2.83465,0,0,2.83465,664.776,181.521), x=0, y=0
    x, y = label_screen_pos(_FakeElem(0, 0, 'matrix(2.83465,0,0,2.83465,664.776,181.521)'))
    assert x == pytest.approx(664.776, abs=0.01)
    assert y == pytest.approx(181.521, abs=0.01)
```

**Step 2: Install pytest if needed**
```bash
pip3 install pytest
```

**Step 3: Run tests — verify they all fail with ImportError**
```bash
cd scripts && python3 -m pytest test_extract_positions.py -v
```
Expected: All tests `ERROR` with `ModuleNotFoundError: No module named 'extract_positions'`

**Step 4: Commit the tests**
```bash
git add scripts/test_extract_positions.py
git commit -m "Add failing tests for SVG position extraction script"
```

---

### Task 3: Implement the extraction script

**Files:**
- Create: `scripts/extract-positions.py`

**Step 1: Create the script**

```python
#!/usr/bin/env python3
"""Extract stop positions from bbr.svg and write x/y into bbr-network.json."""

import json
import math
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

SVG_NS       = 'http://www.w3.org/2000/svg'
INKPAD_NS    = 'http://taptrix.com/inkpad/svg_extensions'
INKSCAPE_NS  = 'http://www.inkscape.org/namespaces/inkscape'


def name_to_id(name: str) -> str:
    return name.strip().lower().replace(' ', '-')


def parse_m(d: str) -> tuple[float, float]:
    """Return (x, y) from the first 'm' command in an SVG path d attribute."""
    m = re.match(r'm\s*([-\d.]+),([-\d.]+)', d.strip(), re.IGNORECASE)
    if not m:
        raise ValueError(f"No m command in: {d[:60]}")
    return float(m.group(1)), float(m.group(2))


def path_center(d: str) -> tuple[float, float]:
    """Compute the geometric centre of a stop-marker path element.

    Three shape types appear in the stops layer:
      circle   – m left,cy c 0,-r ...          centre = (left+r, cy)
      rect     – m x,y h width c corner,...    centre = (x+w/2, y+half_h)
      diamond  – m x,y dx,dy c ...             centre = (x+dx/2, y+dy/2)
    """
    x, y = parse_m(d)

    # Rounded rectangle: contains an 'h' command
    if re.search(r'\bh\b', d, re.IGNORECASE):
        h_m = re.search(r'h\s*([-\d.]+)', d, re.IGNORECASE)
        w = abs(float(h_m.group(1)))
        # First 'c' after the 'h': c corner,0 ...,half_h  ...,half_h
        c_m = re.search(
            r'h\s*[-\d.]+\s+c\s*[-\d.]+,[-\d.]+\s+[-\d.]+,[-\d.]+\s+([-\d.]+),([-\d.]+)',
            d, re.IGNORECASE
        )
        half_h = abs(float(c_m.group(2)))
        return x + w / 2, y + half_h

    # Diamond: the token immediately after the 'm x,y' is 'dx,dy' (no command letter)
    rest = d.strip()
    rest = re.sub(r'^m\s*[-\d.]+,[-\d.]+\s*', '', rest, flags=re.IGNORECASE).strip()
    second = re.match(r'^([-\d.]+),([-\d.]+)', rest)
    if second:
        dx, dy = float(second.group(1)), float(second.group(2))
        return x + dx / 2, y + dy / 2

    # Circle: m left,cy c 0,-r A,B r,-r  → radius = abs of 5th number in c
    c_m = re.search(
        r'c\s*([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)',
        d
    )
    r = abs(float(c_m.group(5)))
    return x + r, y


def label_screen_pos(elem) -> tuple[float, float]:
    """Return the actual screen position of a <text> element, applying transforms."""
    x = float(elem.get('x', 0))
    y = float(elem.get('y', 0))
    transform = elem.get('transform', '')

    rot = re.search(r'rotate\(([-\d.]+)\)', transform)
    if rot:
        angle = math.radians(float(rot.group(1)))
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        return x * cos_a - y * sin_a, x * sin_a + y * cos_a

    mat = re.search(r'matrix\(([^)]+)\)', transform)
    if mat:
        a, b, c, d, e, f = [float(v) for v in re.split(r'[,\s]+', mat.group(1).strip())]
        return x * a + y * c + e, x * b + y * d + f

    return x, y


def _layer_by_label(root: ET.Element, label: str) -> ET.Element | None:
    for g in root.iter(f'{{{SVG_NS}}}g'):
        if g.get(f'{{{INKSCAPE_NS}}}label') == label:
            return g
    return None


def extract_positions(svg_path: Path, json_path: Path) -> None:
    tree = ET.parse(svg_path)
    root = tree.getroot()

    stops_layer = _layer_by_label(root, 'stops')
    names_layer = _layer_by_label(root, 'stop-names')
    if not stops_layer or not names_layer:
        raise RuntimeError("Could not find 'stops' or 'stop-names' layer in SVG")

    # --- Marker centres ---
    markers: list[tuple[float, float]] = []
    for path in stops_layer.findall(f'{{{SVG_NS}}}path'):
        d = path.get('d', '')
        if d:
            markers.append(path_center(d))

    # --- Label positions and names ---
    labels: list[tuple[str, tuple[float, float]]] = []
    for text in names_layer.findall(f'{{{SVG_NS}}}text'):
        name = text.get(f'{{{INKPAD_NS}}}text', '').strip()
        if not name:
            for tspan in text:
                if tspan.text:
                    name = tspan.text.strip()
                    break
        if name:
            labels.append((name, label_screen_pos(text)))

    # --- Greedy nearest-neighbour matching ---
    used: set[int] = set()
    positions: dict[str, tuple[float, float]] = {}
    for marker in markers:
        candidates = [
            (j, lp)
            for j, (_, lp) in enumerate(labels)
            if j not in used
        ]
        if not candidates:
            break
        best_j = min(
            candidates,
            key=lambda jlp: (jlp[1][0] - marker[0]) ** 2 + (jlp[1][1] - marker[1]) ** 2
        )[0]
        used.add(best_j)
        name, _ = labels[best_j]
        positions[name_to_id(name)] = marker

    # Warn about unmatched labels
    for j, (name, _) in enumerate(labels):
        if j not in used:
            print(f"WARNING: label '{name}' was not matched to any stop marker", file=sys.stderr)

    # --- Update JSON ---
    with open(json_path) as f:
        data = json.load(f)

    json_ids = {s['id'] for s in data['stops']}
    for sid in set(positions) - json_ids:
        print(f"WARNING: SVG id '{sid}' not in JSON stops — skipped", file=sys.stderr)
    for sid in json_ids - set(positions):
        print(f"WARNING: JSON stop '{sid}' not found in SVG", file=sys.stderr)

    for stop in data['stops']:
        if stop['id'] in positions:
            stop['x'], stop['y'] = (round(v, 2) for v in positions[stop['id']])

    # Infer junction positions (two passes so junction–junction links resolve)
    all_pos: dict[str, tuple[float, float]] = dict(positions)
    for _ in range(2):
        for j in data['junctions']:
            connected = [all_pos[c] for c in j['connects'] if c in all_pos]
            if connected:
                all_pos[j['id']] = (
                    sum(p[0] for p in connected) / len(connected),
                    sum(p[1] for p in connected) / len(connected),
                )

    for junc in data['junctions']:
        if junc['id'] in all_pos:
            junc['x'], junc['y'] = (round(v, 2) for v in all_pos[junc['id']])

    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

    n_junctions = sum(1 for j in data['junctions'] if 'x' in j)
    print(f"Written positions for {len(positions)} stops and {n_junctions} junctions.")


if __name__ == '__main__':
    repo = Path(__file__).resolve().parent.parent
    extract_positions(repo / 'images' / 'bbr.svg', repo / 'data' / 'bbr-network.json')
```

**Step 2: Run the tests — all should pass**
```bash
cd scripts && python3 -m pytest test_extract_positions.py -v
```
Expected: 12 tests PASSED

**Step 3: Commit**
```bash
git add scripts/extract-positions.py
git commit -m "Add SVG position extraction script (all tests passing)"
```

---

### Task 4: Run the extraction script

**Files:**
- Modify: `data/bbr-network.json` (x/y fields added by script)

**Step 1: Run the script from the repo root**
```bash
python3 scripts/extract-positions.py
```
Expected output (stderr may include warnings for any unmatched items, stdout):
```
Written positions for 30 stops and 4 junctions.
```

**Step 2: Verify positions were written**
```bash
python3 -c "
import json
d = json.load(open('data/bbr-network.json'))
missing = [s['id'] for s in d['stops'] if 'x' not in s]
print('Stops missing x/y:', missing or 'none')
missing_j = [j['id'] for j in d['junctions'] if 'x' not in j]
print('Junctions missing x/y:', missing_j or 'none')
"
```
Expected:
```
Stops missing x/y: none
Junctions missing x/y: none
```

**Step 3: Commit**
```bash
git add data/bbr-network.json
git commit -m "Add x/y positions extracted from bbr.svg to all stops and junctions"
```

---

### Task 5: Add x/y to TypeScript types

**Files:**
- Modify: `app/src/types.ts`

**Step 1: Add optional x/y to StopJson and JunctionJson**

In `app/src/types.ts`, change:
```typescript
export interface StopJson {
  id: string
  lines: string[]
  platforms: number
}
```
to:
```typescript
export interface StopJson {
  id: string
  lines: string[]
  platforms: number
  x?: number
  y?: number
}
```

And change:
```typescript
export interface JunctionJson {
  id: string
  connects: string[]
}
```
to:
```typescript
export interface JunctionJson {
  id: string
  connects: string[]
  x?: number
  y?: number
}
```

**Step 2: Verify TypeScript compiles**
```bash
cd app && npx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**
```bash
git add app/src/types.ts
git commit -m "Add optional x/y position fields to StopJson and JunctionJson"
```

---

### Task 6: Update layout.ts to use fixed positions

**Files:**
- Modify: `app/src/layout.ts`

**Step 1: Replace the entire file**

The SVG viewport is 1190.55 × 841.89 pt. Scale to canvas with padding.

```typescript
import * as d3 from 'd3'
import type { Network } from './network'

export type Positions = Map<string, { id: string; x: number; y: number }>

const SVG_W = 1190.55
const SVG_H = 841.89
const PADDING = 40

function allNodesHavePositions(network: Network): boolean {
  return (
    network.json.stops.every(s => s.x != null && s.y != null) &&
    network.json.junctions.every(j => j.x != null && j.y != null)
  )
}

export function computeLayout(network: Network, width: number, height: number): Positions {
  if (allNodesHavePositions(network)) {
    const scaleX = (width - PADDING * 2) / SVG_W
    const scaleY = (height - PADDING * 2) / SVG_H
    const positions: Positions = new Map()
    for (const s of network.json.stops) {
      positions.set(s.id, { id: s.id, x: PADDING + s.x! * scaleX, y: PADDING + s.y! * scaleY })
    }
    for (const j of network.json.junctions) {
      positions.set(j.id, { id: j.id, x: PADDING + j.x! * scaleX, y: PADDING + j.y! * scaleY })
    }
    return positions
  }

  // Fallback: force-directed layout (used when x/y are absent)
  type N = d3.SimulationNodeDatum & { id: string }
  type L = d3.SimulationLinkDatum<N>

  const ids = [
    ...network.json.stops.map(s => s.id),
    ...network.json.junctions.map(j => j.id),
  ]
  const nodes: N[] = ids.map(id => ({ id }))
  const idxOf = new Map(nodes.map((n, i) => [n.id, i]))

  const links: L[] = Array.from(network.segmentByKey.values()).map(seg => ({
    source: idxOf.get(seg.endpoints[0])!,
    target: idxOf.get(seg.endpoints[1])!,
  }))

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink<N, L>(links).id((_, i) => i).distance(50))
    .force('charge', d3.forceManyBody<N>().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .stop()

  for (let i = 0; i < 300; i++) sim.tick()

  const positions: Positions = new Map()
  for (const n of nodes) {
    positions.set(n.id, { id: n.id, x: n.x ?? 0, y: n.y ?? 0 })
  }
  return positions
}
```

**Step 2: Verify TypeScript compiles**
```bash
cd app && npx tsc --noEmit
```
Expected: no errors

**Step 3: Start the dev server and verify the map visually**
```bash
cd app && npm run dev
```
Open `http://localhost:5173` in a browser. The network should now render with geographic stop positions rather than the force-directed blob. Verify:
- All 30 stops are visible and labelled
- All 4 junctions are visible
- Trains move along segments correctly

**Step 4: Commit**
```bash
git add app/src/layout.ts
git commit -m "Use SVG-derived fixed positions in layout, keep force sim as fallback"
```
