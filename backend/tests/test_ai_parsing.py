"""Unit tests for the AI output parsing helpers — the most regression-prone code.

Run with pytest, or standalone:  python3 tests/test_ai_parsing.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Parsing helpers don't need real settings — defaults are fine
from app.services.vertex_ai import (  # noqa: E402
    _repair_json,
    _strip_code_fences,
    _extract_json_payload,
    _parse_json_dict,
    _as_int,
    _estimate_calories_fallback,
)


def test_repair_json_thousands_separators():
    assert _repair_json('{"calories": 1,234}') == '{"calories": 1234}'


def test_repair_json_trailing_commas():
    assert _repair_json('{"a": 1, }') == '{"a": 1}'
    assert _repair_json('[1, 2, ]') == '[1, 2]'


def test_strip_code_fences():
    fenced = '```json\n{"a": 1}\n```'
    assert _strip_code_fences(fenced).strip() == '{"a": 1}'


def test_strip_code_fences_passthrough():
    assert _strip_code_fences('{"a": 1}') == '{"a": 1}'


def test_extract_json_payload_with_prose():
    text = 'Here you go:\n{"calories": 500}\nEnjoy!'
    assert _extract_json_payload(text) == '{"calories": 500}'


def test_parse_json_dict_happy():
    assert _parse_json_dict('{"name": "Oats", "calories": 389}') == {"name": "Oats", "calories": 389}


def test_parse_json_dict_rejects_array():
    try:
        _parse_json_dict("[1, 2]")
        assert False, "should have raised"
    except ValueError:
        pass


def test_as_int_coercion():
    assert _as_int("450", 0) == 450
    assert _as_int(449.6, 0) == 450
    assert _as_int(None, 7) == 7
    assert _as_int("garbage", 7) == 7


def test_met_fallback_sane_range():
    kcal = _estimate_calories_fallback("running", 30, 75.0)
    assert 200 < kcal < 500


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"  FAIL {name}: {e}")
    sys.exit(1 if failures else 0)
