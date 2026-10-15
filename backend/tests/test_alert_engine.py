import pytest

from services.alert_engine import ReadingValidationError, classify, classify_value

CASES = {
    "glucose": [(53, "red"), (54, "orange"), (69, "orange"), (70, "yellow"), (79, "yellow"), (80, "normal"),
                (180, "normal"), (181, "yellow"), (250, "yellow"), (251, "orange"), (300, "orange"), (301, "red")],
    "heart_rate": [(39, "red"), (40, "orange"), (49, "orange"), (50, "yellow"), (59, "yellow"), (60, "normal"),
                   (100, "normal"), (101, "yellow"), (110, "yellow"), (111, "orange"), (130, "orange"),
                   (131, "red")],
    "spo2": [(89, "red"), (90, "orange"), (93, "orange"), (94, "yellow"), (95, "yellow"), (96, "normal"),
             (100, "normal")],
}


@pytest.mark.parametrize("param,value,expected", [(p, v, e) for p, cs in CASES.items() for v, e in cs])
def test_boundaries(param, value, expected):
    assert classify_value(param, value) == expected


def test_every_valid_integer_maps_to_exactly_one_band():
    from config import settings
    for param in ("glucose", "heart_rate", "spo2"):
        lo, hi = settings.thresholds[param]["valid_range"]
        for v in range(lo, hi + 1):
            hits = [b for b in settings.thresholds[param]["bands"]
                    if (b["min"] is None or v >= b["min"]) and (b["max"] is None or v <= b["max"])]
            assert len(hits) == 1, (param, v)


def test_spec_examples_highest_severity_wins():
    assert classify(185, 80, 98).overall_severity == "yellow"
    c = classify(185, 115, 98)
    assert c.overall_severity == "orange" and c.triggering_parameters == ["glucose", "heart_rate"]
    c = classify(315, 115, 95)
    assert (c.glucose_severity, c.heart_rate_severity, c.spo2_severity, c.overall_severity) == (
        "red", "orange", "yellow", "red")
    assert classify(120, 80, 98).overall_severity == "normal"


@pytest.mark.parametrize("args", [(5, 80, 98), (120, 300, 98), (120, 80, 101), (120.5, 80, 98), (True, 80, 98)])
def test_invalid_readings_rejected(args):
    with pytest.raises(ReadingValidationError):
        classify(*args)
