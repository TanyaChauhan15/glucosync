"""Three-level alert classification.

The numeric bands come from thresholds.json. They are prototype project rules,
not SNOMED CT thresholds, and need clinical validation before any real use.
Readings are integers, and each band is an inclusive [min, max] integer range,
so every valid value maps to exactly one severity with no gaps or overlaps.
"""
from dataclasses import dataclass

from config import settings

PARAMETERS = ("glucose", "heart_rate", "spo2")
SEVERITY_RANK = {"normal": 0, "yellow": 1, "orange": 2, "red": 3}
PARAMETER_LABELS = {"glucose": "Glucose", "heart_rate": "Heart Rate", "spo2": "SpO2"}

SEVERITY_DESCRIPTIONS = {
    "normal": "Within the prototype's normal demonstration range.",
    "yellow": "Caution: mild abnormality. Monitor readings and trends.",
    "orange": "High risk: significant abnormality. Prompt clinical review recommended.",
    "red": "Critical: potential emergency. Immediate assessment and escalation recommended.",
}


class ReadingValidationError(ValueError):
    pass


@dataclass
class Classification:
    glucose_severity: str
    heart_rate_severity: str
    spo2_severity: str
    overall_severity: str
    triggering_parameters: list[str]

    @property
    def is_abnormal(self) -> bool:
        return self.overall_severity != "normal"


def highest(*severities: str) -> str:
    return max(severities, key=lambda s: SEVERITY_RANK[s])


def validate_value(parameter: str, value) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ReadingValidationError(f"{parameter} must be an integer")
    lo, hi = settings.thresholds[parameter]["valid_range"]
    if not lo <= value <= hi:
        raise ReadingValidationError(f"{parameter} must be between {lo} and {hi}")
    return value


def classify_value(parameter: str, value: int) -> str:
    for band in settings.thresholds[parameter]["bands"]:
        lo, hi = band["min"], band["max"]
        if (lo is None or value >= lo) and (hi is None or value <= hi):
            return band["severity"]
    raise ReadingValidationError(f"No threshold band configured for {parameter}={value}")


def classify(glucose: int, heart_rate: int, spo2: int) -> Classification:
    values = {"glucose": glucose, "heart_rate": heart_rate, "spo2": spo2}
    sev = {p: classify_value(p, validate_value(p, values[p])) for p in PARAMETERS}
    overall = highest(*sev.values())
    triggering = [p for p in PARAMETERS if sev[p] != "normal"]
    return Classification(sev["glucose"], sev["heart_rate"], sev["spo2"], overall, triggering)


def threshold_table() -> dict:
    """The active rules, exposed read-only to the UI so users can see what drives alerts."""
    return {p: settings.thresholds[p] for p in PARAMETERS}
