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
