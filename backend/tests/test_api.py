"""API tests mapped to the specification's test scenarios (section 20)."""
import threading
import time

from conftest import PASSWORD, login_patient, signup
from database import SessionLocal
from models import AcknowledgementBatch, Alert, AuditLog, ConsentHistory, Patient, SensorReading
from services.acknowledgement import NothingPending, acknowledge_patient
from services.readings import ingest_reading


def pending_entry(nurse, pid):
    items = nurse.get("/api/alerts/pending-by-patient").json()["items"]
    return [e for e in items if e["patient_id"] == pid]


# ---------- Test 1: registration ----------

def test_signup_creates_patient_with_generated_id_and_consent(make_client):
    c = make_client()
    email, pid = signup(c, consent=True)
    assert pid.startswith("PAT") and pid[3:].isdigit()
    db = SessionLocal()
    p = db.get(Patient, pid)
    assert p.email == email and p.his_consent_status == "granted" and p.his_consent_changed_at is not None
    assert p.password_hash != PASSWORD and p.password_hash.startswith("$2")
    hist = db.query(ConsentHistory).filter_by(patient_id=pid).all()
    assert [h.consent_status for h in hist] == ["granted"] and hist[0].change_source == "signup"
    db.close()
    me = login_patient(c, email)
    assert me["user"]["user_id"] == pid
    assert c.get("/api/patients/me").json()["patient_id"] == pid


def test_signup_without_consent_and_validation(make_client):
    c = make_client()
    email, pid = signup(c, consent=False)
    db = SessionLocal()
    assert db.get(Patient, pid).his_consent_status == "declined"
    db.close()
    dup = c.post("/api/auth/patient/signup", json={
        "full_name": "Dup", "email": email.upper(), "contact_number": "9812345678",
        "password": PASSWORD, "confirm_password": PASSWORD})
    assert dup.status_code == 409
    bad = {
        "full_name": "  ", "email": "not-an-email", "contact_number": "12ab",
        "password": "short", "confirm_password": "different",
    }
    r = c.post("/api/auth/patient/signup", json=bad)
    assert r.status_code == 422
    fields = r.json()["fields"]
    for key in ("full_name", "email", "contact_number", "password"):
        assert key in fields, fields
    r = c.post("/api/auth/patient/signup", json={
        "full_name": "Mismatch Person", "email": "m@example.com", "contact_number": "9812345678",
        "password": PASSWORD, "confirm_password": PASSWORD + "x"})
    assert r.status_code == 422 and "do not match" in r.json()["detail"]


def test_ids_are_unique_and_sequential(make_client):
    c = make_client()
    _, a = signup(c)
    _, b = signup(c)
    assert int(b[3:]) == int(a[3:]) + 1


# ---------- auth ----------

def test_login_failures_and_logout_invalidates_session(make_client, patient):
    c, pid, email = patient
    anon = make_client()
    assert anon.post("/api/auth/patient/login", json={"email": email, "password": "Wrong#123"}).status_code == 401
    assert anon.post("/api/auth/staff/login",
                     json={"staff_id": "DOC001", "password": "Demo123!", "role": "nurse"}).status_code == 401
    assert anon.get("/api/patients/me").status_code == 401
    token = c.token
    assert c.post("/api/auth/logout").status_code == 200
    c.token = token  # re-use the old token: it must be rejected now
    assert c.get("/api/auth/me").status_code == 401


def test_seeded_demo_patients_can_log_in(make_client):
    for email, pid in (("aarav@demo.local", "PAT001"), ("priya@demo.local", "PAT002"),
                       ("rohan@demo.local", "PAT003"), ("ANANYA@demo.local", "PAT004")):
        c = make_client()
        assert login_patient(c, email, "Demo123!")["user"]["user_id"] == pid
        assert len(c.get(f"/api/patients/{pid}/readings?minutes=1440").json()["items"]) > 200


def test_staff_login_by_id(doctor, nurse):
    assert doctor.get("/api/auth/me").json() == {"user_type": "doctor", "user_id": "DOC001",
                                                 "full_name": "Dr. Kavya Iyer"}
    assert nurse.get("/api/auth/me").json()["user_type"] == "nurse"


# ---------- Test 2: simulation ----------

def test_simulation_start_stop(patient):
    c, pid, _ = patient
    assert c.get("/api/simulation/status").json()["is_running"] is False
    r = c.post("/api/simulation/start").json()
    assert r["is_running"] is True and r["already_running"] is False
    assert c.post("/api/simulation/start").json()["already_running"] is True  # no duplicate process
    time.sleep(1.5)
    st = c.get("/api/simulation/status").json()
    assert st["is_running"] and st["last_generated_at"]
    c.post("/api/simulation/stop")
    assert c.get("/api/simulation/status").json()["is_running"] is False
    db = SessionLocal()
    n1 = db.query(SensorReading).filter_by(patient_id=pid, source_type="simulated").count()
    assert n1 >= 3
    time.sleep(1.0)
    n2 = db.query(SensorReading).filter_by(patient_id=pid, source_type="simulated").count()
    db.close()
    assert n1 == n2  # readings stop after Stop
    readings = c.get(f"/api/patients/{pid}/readings?minutes=15").json()["items"]
    assert len(readings) == n1
    from services.simulation import manager
    assert pid not in manager.tasks


# ---------- Test 3: alert generation ----------

def test_yellow_orange_red_alerts_saved(patient):
    c, pid, _ = patient
    for sev in ("yellow", "orange", "red"):
        r = c.post("/api/simulation/generate-reading", json={"scenario": sev}).json()
        assert r["reading"]["overall_severity"] == sev
        a = r["alert"]
        assert a["overall_severity"] == sev and a["alert_status"] == "pending"
        assert a["alert_code"].startswith("ALT") and a["triggering_parameters"]
        assert a["patient_name"] == "Test Patient" and a["created_at"].endswith("Z")
        for p in a["triggering_parameters"]:
            assert a[f"{p}_severity"] != "normal"
    normal = c.post("/api/simulation/generate-reading", json={"scenario": "normal"}).json()
    assert normal["alert"] is None
    db = SessionLocal()
    alerts = db.query(Alert).filter_by(patient_id=pid).order_by(Alert.alert_id).all()
    assert [a.overall_severity for a in alerts] == ["yellow", "orange", "red"]
    for a in alerts:
        reading = db.get(SensorReading, a.reading_id)
        assert (reading.glucose, reading.heart_rate, reading.spo2) == (a.glucose, a.heart_rate, a.spo2)
    db.close()


# ---------- Test 4: patient alert history + filters ----------

def test_patient_alert_history_filters_and_persistence(patient):
    c, pid, email = patient
    for sev in ("yellow", "red", "red"):
        c.post("/api/simulation/generate-reading", json={"scenario": sev})
    h = c.get(f"/api/patients/{pid}/alerts").json()
    assert h["total"] == 3
    assert c.get(f"/api/patients/{pid}/alerts?severity=red").json()["total"] == 2
    assert c.get(f"/api/patients/{pid}/alerts?status=acknowledged").json()["total"] == 0
    assert c.get(f"/api/patients/{pid}/alerts?date_from=2000-01-01T00:00:00Z&date_to=2000-01-02T00:00:00Z"
                 ).json()["total"] == 0
    assert c.get(f"/api/patients/{pid}/alerts?page_size=2&page=2").json()["items"].__len__() == 1
    c.post("/api/auth/logout")
    login_patient(c, email)
    assert c.get(f"/api/patients/{pid}/alerts").json()["total"] == 3
    one = h["items"][0]
    assert c.get(f"/api/alerts/{one['alert_id']}").json()["alert_id"] == one["alert_id"]


# ---------- Test 5: nurse notifications ----------

def test_nurse_notifications(patient, nurse, nurse2):
    c, pid, _ = patient
    before = nurse.get("/api/notifications/unread-count").json()["unread_count"]
    r = c.post("/api/simulation/generate-reading", json={"scenario": "orange"}).json()
    assert nurse.get("/api/notifications/unread-count").json()["unread_count"] == before + 1
    items = nurse.get("/api/notifications").json()["items"]
    note = next(n for n in items if n["alert_id"] == r["alert"]["alert_id"])
    assert note["severity"] == "orange" and note["is_read"] is False and pid in note["message"]
    n2_before = nurse2.get("/api/notifications/unread-count").json()["unread_count"]
    assert nurse.post(f"/api/notifications/{note['notification_id']}/read").json()["unread_count"] == before
    # read status is per nurse, and reading does NOT acknowledge the patient
    assert nurse2.get("/api/notifications/unread-count").json()["unread_count"] == n2_before
    assert pending_entry(nurse, pid)[0]["pending_count"] == 1
    nurse.post("/api/notifications/read-all")
    assert nurse.get("/api/notifications/unread-count").json()["unread_count"] == 0


# ---------- Test 6 & 7: patient-level acknowledgement ----------

def test_patient_level_acknowledgement_and_reopen(patient, nurse, doctor):
    c, pid, _ = patient
    for sev in ("yellow", "orange", "red", "orange", "red"):
        c.post("/api/simulation/generate-reading", json={"scenario": sev})
    entries = pending_entry(nurse, pid)
    assert len(entries) == 1  # one queue entry per patient
    e = entries[0]
    assert e["pending_count"] == 5 and e["highest_pending_severity"] == "red" and e["urgent"]
    assert e["pending_by_severity"] == {"yellow": 1, "orange": 2, "red": 2}

    r = nurse.post(f"/api/patients/{pid}/acknowledge").json()
    assert r["acknowledged_count"] == 5 and r["batch"]["highest_severity"] == "red"
    batch_id = r["batch"]["batch_id"]
    assert pending_entry(nurse, pid)[0]["pending_count"] == 0
    assert pending_entry(nurse, pid)[0]["last_acknowledgement"]["nurse_id"] == "NUR001"

    db = SessionLocal()
    alerts = db.query(Alert).filter_by(patient_id=pid).all()
    assert len(alerts) == 5  # nothing deleted or merged
    assert all(a.alert_status == "acknowledged" and a.acknowledged_by == "NUR001"
               and a.acknowledgement_batch_id == batch_id for a in alerts)
    b = db.get(AcknowledgementBatch, batch_id)
    assert b.alert_count == 5 and b.nurse_id == "NUR001"
    assert db.query(AuditLog).filter_by(action="acknowledge_patient", target_patient_id=pid).count() == 1
    db.close()

    # visible to patient and doctor
    hist = c.get(f"/api/patients/{pid}/alerts").json()["items"]
    assert all(a["alert_status"] == "acknowledged" and a["acknowledged_by"] == "NUR001" for a in hist)
    acks = doctor.get(f"/api/patients/{pid}/acknowledgements").json()["items"]
    assert acks[0]["batch_id"] == batch_id and acks[0]["alert_count"] == 5

    # second click: nothing pending
    again = nurse.post(f"/api/patients/{pid}/acknowledge").json()
    assert again["acknowledged_count"] == 0

    # Test 7: new alert reopens the queue entry, old ones stay acknowledged
    new = c.post("/api/simulation/generate-reading", json={"scenario": "yellow"}).json()["alert"]
    e = pending_entry(nurse, pid)[0]
    assert e["pending_count"] == 1 and e["highest_pending_severity"] == "yellow"
    hist = c.get(f"/api/patients/{pid}/alerts?page_size=100").json()["items"]
    assert len(hist) == 6
    assert [a["alert_status"] for a in hist if a["alert_id"] != new["alert_id"]] == ["acknowledged"] * 5
    assert next(a for a in hist if a["alert_id"] == new["alert_id"])["alert_status"] == "pending"


def test_concurrent_acknowledgement_is_atomic(patient):
    _, pid, _ = patient
    db = SessionLocal()
    for g in (190, 260, 320, 200):
        ingest_reading(db, pid, g, 80, 98, broadcast=False)
    db.close()
    results, errors = [], []
    barrier = threading.Barrier(2)

    def worker(nurse_id):
        s = SessionLocal()
        try:
            barrier.wait()
            results.append(acknowledge_patient(s, pid, nurse_id).alert_count)
        except NothingPending:
            results.append(0)
        except Exception as exc:  # pragma: no cover
            errors.append(exc)
        finally:
            s.close()

    threads = [threading.Thread(target=worker, args=(n,)) for n in ("NUR001", "NUR002")]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors
    assert sorted(results) == [0, 4]
    db = SessionLocal()
    assert db.query(Alert).filter_by(patient_id=pid, alert_status="pending").count() == 0
    assert db.query(Alert).filter_by(patient_id=pid).count() == 4
    assert db.query(AcknowledgementBatch).filter_by(patient_id=pid).count() == 1  # loser rolled back
    db.close()


def test_alert_arriving_after_batch_stays_pending(patient):
    _, pid, _ = patient
    db = SessionLocal()
    ingest_reading(db, pid, 320, 80, 98, broadcast=False)
    batch = acknowledge_patient(db, pid, "NUR001")
    ingest_reading(db, pid, 60, 80, 98, broadcast=False)
    later = db.query(Alert).filter_by(patient_id=pid).order_by(Alert.alert_id.desc()).first()
    assert batch.alert_count == 1 and later.alert_status == "pending" and later.acknowledgement_batch_id is None
    db.close()


# ---------- Test 8: consent ----------

def test_consent_toggle_and_history(patient):
    c, pid, _ = patient
    assert c.get("/api/patients/me/consent").json()["consent_status"] == "declined"
    r = c.put("/api/patients/me/consent", json={"consent": True}).json()
    assert r["consent_status"] == "granted" and r["changed"]
    db = SessionLocal()
    assert db.get(Patient, pid).his_consent_status == "granted"
    db.close()
    # shared with mock HIS while granted
    c.post("/api/simulation/generate-reading", json={"scenario": "red"})
    hist = c.get("/api/his/sync-history").json()
    assert hist["total"] == 2 and {i["data_type"] for i in hist["items"]} == {"observation", "alert"}
    r = c.put("/api/patients/me/consent", json={"consent": False}).json()
    assert r["consent_status"] == "withdrawn"
    db = SessionLocal()
    assert db.get(Patient, pid).his_consent_status == "withdrawn"
    db.close()
    c.post("/api/simulation/generate-reading", json={"scenario": "red"})
    assert c.get("/api/his/sync-history").json()["total"] == 2  # no sharing after withdrawal
    assert c.get(f"/api/patients/{pid}/alerts").json()["total"] == 2  # local records kept
    assert c.get("/api/patients/me/consent").json()["consent"] is False
    statuses = [h["consent_status"] for h in c.get("/api/patients/me/consent-history").json()["items"]]
    assert statuses == ["withdrawn", "granted", "declined"]
    st = c.get("/api/his/sync-status").json()["items"]
    assert len(st) == 1 and st[0]["sharing_status"] == "not_shared_no_consent"


# ---------- Test 9: doctor ----------

def test_doctor_read_only_views(doctor, patient):
    c, pid, _ = patient
    c.post("/api/simulation/generate-reading", json={"scenario": "red"})
    items = doctor.get("/api/patients").json()["items"]
    assert {"PAT001", "PAT002", "PAT003", "PAT004", pid} <= {i["patient_id"] for i in items}
    assert doctor.get("/api/patients?q=aarav").json()["items"][0]["patient_id"] == "PAT001"
    assert doctor.get(f"/api/patients/{pid}").status_code == 200
    assert len(doctor.get("/api/patients/PAT001/readings?minutes=1440").json()["items"]) > 200
    assert doctor.get(f"/api/alerts?q={pid}").json()["total"] == 1
    assert doctor.get("/api/alerts?severity=red&status=pending").json()["total"] >= 2
    stats = doctor.get("/api/dashboard/stats").json()
    assert stats["total_patients"] >= 5
    assert doctor.post(f"/api/patients/{pid}/acknowledge").status_code == 403
    assert doctor.post("/api/simulation/start").status_code == 403
    assert doctor.post("/api/simulation/generate-reading", json={}).status_code == 403
    assert doctor.get("/api/notifications").status_code == 403


# ---------- Test 10: access control ----------

def test_access_control(patient, make_client, nurse):
    c, pid, _ = patient
    for url in ("/api/patients/PAT001", "/api/patients/PAT001/readings", "/api/patients/PAT001/latest-reading",
                "/api/patients/PAT001/alerts", "/api/patients/PAT001/acknowledgements",
                "/api/his/sync-history?patient_id=PAT001"):
        assert c.get(url).status_code == 403, url
    for url in ("/api/patients", "/api/alerts", "/api/alerts/pending-by-patient", "/api/dashboard/stats",
                "/api/notifications", "/api/his/mock-records/PAT001"):
        assert c.get(url).status_code == 403, url
    seeded_alert = SessionLocal().query(Alert).filter_by(patient_id="PAT001").first()
    assert c.get(f"/api/alerts/{seeded_alert.alert_id}").status_code == 403
    assert c.post("/api/patients/PAT001/acknowledge").status_code == 403
    assert c.post(f"/api/patients/{pid}/acknowledge").status_code == 403
    assert nurse.post("/api/simulation/start").status_code == 403
    assert nurse.post("/api/simulation/stop").status_code == 403
    assert nurse.get("/api/patients/me/consent").status_code == 403
    anon = make_client()
    assert anon.get("/api/patients/PAT001/readings").status_code == 401
    assert anon.post("/api/simulation/start").status_code == 401
    # His sync status for a patient only includes themselves
    assert [i["patient_id"] for i in c.get("/api/his/sync-status").json()["items"]] == [pid]


def test_seed_is_idempotent(app_client):
    from services.seed import seed_all
    db = SessionLocal()
    counts = (db.query(Patient).count(), db.query(Alert).count(), db.query(SensorReading).count())
    seed_all(db)
    seed_all(db)
    assert (db.query(Patient).count(), db.query(Alert).count(), db.query(SensorReading).count()) == counts
    seeded = {p: db.query(Alert).filter_by(patient_id=p, alert_status="pending").all()
              for p in ("PAT001", "PAT002", "PAT003", "PAT004")}
    db.close()
    sev = {p: {a.overall_severity for a in v} for p, v in seeded.items()}
    assert "red" in sev["PAT001"] and max(sev["PAT002"], key=len) and "red" not in sev["PAT002"]
    assert "orange" in sev["PAT002"] and sev["PAT003"] == {"yellow"} and sev["PAT004"] == set()


def test_websocket_requires_auth_and_receives_events(app_client, patient, make_client):
    from starlette.websockets import WebSocketDisconnect
    c, pid, _ = patient
    try:
        with app_client.websocket_connect("/ws"):
            raise AssertionError("unauthenticated socket should be closed")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401
    nurse = make_client()
    from conftest import login_staff
    login_staff(nurse, "NUR002", "nurse")
    app_client.cookies.clear()
    with app_client.websocket_connect("/ws", headers={"Authorization": f"Bearer {nurse.token}"}) as ws:
        assert ws.receive_json()["type"] == "connected"
        c.post("/api/simulation/generate-reading", json={"scenario": "red"})
        types = set()
        for _ in range(4):
            msg = ws.receive_json()
            types.add(msg["type"])
            if msg["type"] == "reading.new":
                assert msg["data"]["patient_id"] == pid
        assert {"reading.new", "alert.new", "notification.new", "queue.updated"} == types
