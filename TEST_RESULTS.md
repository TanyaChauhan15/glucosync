# GlucoSync test results

Last run: 2026-10-15 21:15 UTC on Linux (Python 3.13, Node 22, Chromium via Playwright 1.56.1). Every test listed here was actually executed.

## Backend: pytest (57 passed)

Covers spec tests 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 11 at API level, plus threshold boundaries for every integer value, concurrent acknowledgement by two nurses (threads and real HTTP), an alert arriving after a batch staying pending, seed idempotency, demo logins, logout invalidation and WebSocket auth/events. Test 11 starts a real uvicorn process, stops it, restarts it on the same database and verifies readings, alerts, consent and acknowledgement history.

```
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_boundaries
tests/test_alert_engine.py::test_every_valid_integer_maps_to_exactly_one_band PASSED
tests/test_alert_engine.py::test_spec_examples_highest_severity_wins PASSED
tests/test_alert_engine.py::test_invalid_readings_rejected
tests/test_alert_engine.py::test_invalid_readings_rejected
tests/test_alert_engine.py::test_invalid_readings_rejected
tests/test_alert_engine.py::test_invalid_readings_rejected
tests/test_alert_engine.py::test_invalid_readings_rejected
tests/test_api.py::test_signup_creates_patient_with_generated_id_and_consent PASSED
tests/test_api.py::test_signup_without_consent_and_validation PASSED
tests/test_api.py::test_ids_are_unique_and_sequential PASSED
tests/test_api.py::test_login_failures_and_logout_invalidates_session PASSED
tests/test_api.py::test_seeded_demo_patients_can_log_in PASSED
tests/test_api.py::test_staff_login_by_id PASSED
tests/test_api.py::test_simulation_start_stop PASSED
tests/test_api.py::test_yellow_orange_red_alerts_saved PASSED
tests/test_api.py::test_patient_alert_history_filters_and_persistence PASSED
tests/test_api.py::test_nurse_notifications PASSED
tests/test_api.py::test_patient_level_acknowledgement_and_reopen PASSED
tests/test_api.py::test_concurrent_acknowledgement_is_atomic PASSED
tests/test_api.py::test_alert_arriving_after_batch_stays_pending PASSED
tests/test_api.py::test_consent_toggle_and_history PASSED
tests/test_api.py::test_doctor_read_only_views PASSED
tests/test_api.py::test_access_control PASSED
tests/test_api.py::test_seed_is_idempotent PASSED
tests/test_api.py::test_websocket_requires_auth_and_receives_events PASSED
tests/test_restart_persistence.py::test_data_survives_server_restart PASSED
============================= 57 passed in 27.74s ==============================
```

## End-to-end: Playwright, Chromium (11 passed)

Each test fails on any browser JavaScript error, console error, failed API request or 5xx response (requests the browser aborts because of a page reload are ignored).

```
  ✓   1 [desktop-chromium] › e2e/access-and-navigation.spec.js:3:1 › Test 10: access control is enforced by the backend and routes (3.9s)
  ✓   2 [desktop-chromium] › e2e/access-and-navigation.spec.js:27:1 › Test 12a: every patient page, link and button works (3.3s)
  ✓   3 [desktop-chromium] › e2e/access-and-navigation.spec.js:70:1 › Test 12b: every nurse and doctor page, link and button works (5.8s)
  ✓   4 [desktop-chromium] › e2e/patient.spec.js:2:1 › Test 1: patient registration through the UI, then login (1.6s)
  ✓   5 [desktop-chromium] › e2e/patient.spec.js:58:1 › Test 2: start simulation, graphs update live, stop halts readings (10.0s)
  ✓   6 [desktop-chromium] › e2e/patient.spec.js:96:1 › Tests 3 and 4: yellow/orange/red alerts are saved and history persists (3.9s)
  ✓   7 [desktop-chromium] › e2e/patient.spec.js:150:1 › Test 8: consent and privacy toggle persists (2.2s)
  ✓   8 [desktop-chromium] › e2e/patient.spec.js:177:1 › Seeded demo patient logs in and sees 24 hours of history immediately (1.6s)
  ✓   9 [desktop-chromium] › e2e/staff.spec.js:3:1 › Test 5: nurse receives live notification and queue update without refresh (3.0s)
  ✓  10 [desktop-chromium] › e2e/staff.spec.js:33:1 › Tests 6 and 7: one acknowledgement per patient covers all pending alerts; new alert reopens (7.4s)
  ✓  11 [desktop-chromium] › e2e/staff.spec.js:92:1 › Test 9: doctor sees patients, details, graphs and history, but no controls (2.0s)
  11 passed (50.9s)
```

## Not covered by automation

- Notification sounds are generated with the Web Audio API; tests verify the mute toggle state, not audible output.
- Spec test 11 (server restart) runs in the backend suite against a real server process, not through the browser.
- Tested in Chromium only (desktop viewport plus a 390 px mobile viewport check); Firefox/Safari were not run.
- Windows PowerShell commands in the README were written for Windows but executed here on Linux.
