"""Test 11 against a real uvicorn process: data survives a full server stop/restart.

Also checks two nurses acknowledging the same patient at the same instant over HTTP.
"""
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx

BACKEND = Path(__file__).resolve().parents[1]
PW = "Strong#Pass1"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    def __init__(self, db_path, port):
        self.port = port
        self.env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}", "SIMULATION_INTERVAL_SECONDS": "0.3",
                    "HIS_MOCK_FAILURE_RATE": "0", "SEED_DEMO_DATA": "true"}
        self.proc = None

    def start(self):
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--port", str(self.port)],
            cwd=BACKEND, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            try:
                if httpx.get(self.url("/api/health"), timeout=1).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        raise RuntimeError("server did not start")

    def stop(self):
        self.proc.terminate()
        self.proc.wait(timeout=20)

    def url(self, path):
        return f"http://127.0.0.1:{self.port}{path}"


def client(server):
    return httpx.Client(base_url=server.url(""), timeout=20)


def test_data_survives_server_restart():
    db = Path(tempfile.mkdtemp()) / "persist.db"
    server = Server(db, _free_port())
    server.start()
    try:
        p = client(server)
        email = "persist@example.com"
        r = p.post("/api/auth/patient/signup", json={"full_name": "Persist Person", "email": email,
                                                     "contact_number": "9876543210", "password": PW,
                                                     "confirm_password": PW, "his_consent": False})
        pid = r.json()["patient"]["patient_id"]
        assert p.post("/api/auth/patient/login", json={"email": email, "password": PW}).status_code == 200
        for sev in ("yellow", "orange", "red", "red"):
            assert p.post("/api/simulation/generate-reading", json={"scenario": sev}).status_code == 200
        assert p.put("/api/patients/me/consent", json={"consent": True}).json()["consent_status"] == "granted"
        assert p.post("/api/simulation/start").json()["is_running"] is True
        time.sleep(1)

        n1, n2 = client(server), client(server)
        for c, sid in ((n1, "NUR001"), (n2, "NUR002")):
            assert c.post("/api/auth/staff/login",
                          json={"staff_id": sid, "password": "Demo123!", "role": "nurse"}).status_code == 200
        results = []
        barrier = threading.Barrier(2)

        def ack(c):
            barrier.wait()
            results.append(c.post(f"/api/patients/{pid}/acknowledge").json()["acknowledged_count"])

        ts = [threading.Thread(target=ack, args=(c,)) for c in (n1, n2)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        assert 0 in results and len(results) == 2 and sum(results) >= 4  # exactly one nurse processed the batch
        before_alerts = p.get(f"/api/patients/{pid}/alerts?page_size=100").json()
        before_readings = len(p.get(f"/api/patients/{pid}/readings?minutes=60").json()["items"])
        acks_before = n1.get(f"/api/patients/{pid}/acknowledgements").json()["items"]
        assert len(acks_before) == 1
    finally:
        server.stop()

    server.start()  # same database file
    try:
        p = client(server)
        assert p.post("/api/auth/patient/login", json={"email": email, "password": PW}).status_code == 200
        after_alerts = p.get(f"/api/patients/{pid}/alerts?page_size=100").json()
        assert after_alerts["total"] >= before_alerts["total"] >= 4
        before_map = {a["alert_id"]: a["alert_status"] for a in before_alerts["items"]}
        after_map = {a["alert_id"]: a["alert_status"] for a in after_alerts["items"]}
        assert all(after_map[k] == v for k, v in before_map.items())
        assert len(p.get(f"/api/patients/{pid}/readings?minutes=60").json()["items"]) >= before_readings
        assert p.get("/api/patients/me/consent").json()["consent_status"] == "granted"
        # Simulation that was running when the server stopped is reconciled to stopped.
        assert p.get("/api/simulation/status").json()["is_running"] is False
        n = client(server)
        n.post("/api/auth/staff/login", json={"staff_id": "NUR001", "password": "Demo123!", "role": "nurse"})
        assert n.get(f"/api/patients/{pid}/acknowledgements").json()["items"] == acks_before
        # seed did not duplicate demo data on restart
        names = [i["patient_id"] for i in n.get("/api/patients").json()["items"]]
        assert names.count("PAT001") == 1 and len(names) == 5
    finally:
        server.stop()
