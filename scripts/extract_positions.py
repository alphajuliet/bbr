"""
extract_positions.py — Extract stop positions from an Inkscape SVG and write
them into data/bbr-network.json.

Usage (from repo root):
    python3 scripts/extract_positions.py
"""

import json
import math
import re


# ---------------------------------------------------------------------------
# Pure helpers (also exported for testing)
# ---------------------------------------------------------------------------

def name_to_id(name: str) -> str:
    """Lowercase, strip outer whitespace, replace inner spaces with hyphens."""
    return name.strip().lower().replace(' ', '-')


def parse_m(d: str) -> tuple[float, float]:
    """Return (x, y) from the first 'm' command in an SVG path d attribute."""
    m = re.search(r'm\s*([-\d.]+),([-\d.]+)', d)
    if not m:
        raise ValueError(f"No 'm' command found in path: {d!r}")
    return (float(m.group(1)), float(m.group(2)))


def path_center(d: str) -> tuple[float, float]:
    """
    Compute the geometric centre of a stop-marker path.

    Three shapes are handled:
      Circle  — no 'h' command, token after 'm x,y' is a command letter.
      Rect    — contains an 'h' command.
      Diamond — no 'h', token after 'm x,y' is a relative 'dx,dy' lineto.
    """
    x, y = parse_m(d)

    if ' h ' in d or d.startswith('m') and 'h ' in d:
        # ---- Rect ----
        # m x,y h width c corner_r,0 ...,half_h  ...,half_h
        h_m = re.search(r'h\s*([-\d.]+)', d)
        width = float(h_m.group(1))

        # Find the 'c' that follows the 'h'; its 6th number is half_h.
        after_h = d[h_m.end():]
        c_m = re.search(r'c\s*([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)', after_h)
        half_h = float(c_m.group(6))

        return (x + width / 2, y + half_h)

    # Split off everything after the first 'm x,y' token to see what follows.
    # Pattern: after the initial coordinates, what is the next token?
    rest_m = re.match(
        r'm\s*[-\d.]+,[-\d.]+\s+([-\d.]+),([-\d.]+)',
        d
    )
    if rest_m:
        # ---- Diamond ----
        # m x,y dx,dy c ...  (implicit relative lineto before the first 'c')
        dx = float(rest_m.group(1))
        dy = float(rest_m.group(2))
        return (x + dx / 2, y + dy / 2)

    # ---- Circle ----
    # m left,cy  c 0,-r  ...
    # The 5th number in the first 'c' is the radius.
    c_m = re.search(
        r'c\s*([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)',
        d
    )
    r = float(c_m.group(6))  # last y of 3rd bezier point (= radius, positive)
    # r may be negative depending on winding; take abs
    r = abs(r)
    return (x + r, y)


def label_screen_pos(elem) -> tuple[float, float]:
    """
    Return the actual screen (x, y) of a <text> SVG element, applying any
    transform attribute.

    Supported transforms:
      (none)              — return (x, y) directly
      rotate(θ)           — apply 2D rotation by θ degrees
      matrix(a,b,c,d,e,f) — apply affine transform
    """
    x = float(elem.get('x', 0))
    y = float(elem.get('y', 0))
    transform = elem.get('transform', '')

    if not transform:
        return (x, y)

    # rotate(θ) or rotate(θ, cx, cy) — only the simple form is used here
    rot_m = re.match(r'rotate\(\s*([-\d.]+)\s*\)', transform)
    if rot_m:
        theta = math.radians(float(rot_m.group(1)))
        xp = x * math.cos(theta) - y * math.sin(theta)
        yp = x * math.sin(theta) + y * math.cos(theta)
        return (xp, yp)

    # matrix(a,b,c,d,e,f)
    mat_m = re.match(
        r'matrix\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)',
        transform
    )
    if mat_m:
        a, b, c, d, e, f = (float(mat_m.group(i)) for i in range(1, 7))
        xp = x * a + y * c + e
        yp = x * b + y * d + f
        return (xp, yp)

    # Unrecognised transform — return raw coordinates
    return (x, y)


# ---------------------------------------------------------------------------
# Main extraction logic
# ---------------------------------------------------------------------------

def _layer_by_label(root, label):
    INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape'
    SVG_NS = 'http://www.w3.org/2000/svg'
    for g in root.iter(f'{{{SVG_NS}}}g'):
        if g.get(f'{{{INKSCAPE_NS}}}label') == label:
            return g
    return None


def extract_positions(svg_path, json_path):
    import xml.etree.ElementTree as ET
    SVG_NS    = 'http://www.w3.org/2000/svg'
    INKPAD_NS = 'http://taptrix.com/inkpad/svg_extensions'
    INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape'

    tree = ET.parse(svg_path)
    root = tree.getroot()

    stops_layer = _layer_by_label(root, 'stops')
    names_layer = _layer_by_label(root, 'stop-names')
    if not stops_layer or not names_layer:
        raise RuntimeError("Could not find 'stops' or 'stop-names' layer in SVG")

    # Extract marker centres
    markers = []
    for path in stops_layer.findall(f'{{{SVG_NS}}}path'):
        d = path.get('d', '')
        if d:
            markers.append(path_center(d))

    # Extract label positions and names
    labels = []
    for text in names_layer.findall(f'{{{SVG_NS}}}text'):
        name = text.get(f'{{{INKPAD_NS}}}text', '').strip()
        if not name:
            for tspan in text:
                if tspan.text:
                    name = tspan.text.strip()
                    break
        if name:
            labels.append((name, label_screen_pos(text)))

    # Greedy nearest-neighbour matching
    used = set()
    positions = {}
    for marker in markers:
        candidates = [(j, lp) for j, (_, lp) in enumerate(labels) if j not in used]
        if not candidates:
            break
        best_j = min(candidates,
                     key=lambda jlp: (jlp[1][0]-marker[0])**2 + (jlp[1][1]-marker[1])**2)[0]
        used.add(best_j)
        name, _ = labels[best_j]
        positions[name_to_id(name)] = marker

    import sys
    for j, (name, _) in enumerate(labels):
        if j not in used:
            print(f"WARNING: label '{name}' not matched to any stop marker", file=sys.stderr)

    # Update JSON
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

    # Infer junction positions (two passes)
    all_pos = dict(positions)
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
    from pathlib import Path
    repo = Path(__file__).resolve().parent.parent
    extract_positions(repo / 'images' / 'bbr.svg', repo / 'data' / 'bbr-network.json')
