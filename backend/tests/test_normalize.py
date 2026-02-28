import pytest
from api.views import _normalize_plate


@pytest.mark.parametrize("raw, expected", [
    ("abc-123",    "ABC-123"),   # lowercased → uppercased
    ("ABC 123",    "ABC123"),    # space stripped
    ("ABC.123",    "ABC123"),    # dot stripped
    ("ABC_123",    "ABC123"),    # underscore stripped
    ("ABC-123-XY", "ABC-123-XY"), # hyphens preserved
    ("",           ""),          # empty string
    ("!@#$%",      ""),          # only special chars
    ("  ABC-123 ", "ABC-123"),   # surrounding whitespace stripped
    ("abc-123xyz", "ABC-123XYZ"), # mixed case + alphanumeric
])
def test_normalize_plate(raw, expected):
    assert _normalize_plate(raw) == expected
