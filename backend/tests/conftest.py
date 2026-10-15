import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest

# Configure an isolated database BEFORE the app modules are imported.
_TMP = tempfile.mkdtemp(prefix="glucosync-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP) / 'test.db'}"
os.environ["SIMULATION_INTERVAL_SECONDS"] = "0.3"
os.environ["HIS_MOCK_FAILURE_RATE"] = "0"
os.environ["SEED_DEMO_DATA"] = "true"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

PASSWORD = "Strong#Pass1"


@pytest.fixture(scope="session")
def app_client():
    with TestClient(app) as c:
        yield c


class UserSession:
    """Acts as one logged-in browser: every request carries its own session token.

    All sessions share the single app instance (and its event loop) started by app_client,
    so background simulation tasks keep running between requests.
    """

    def __init__(self, client: TestClient):
        self.client = client
        self.token = None

    def _headers(self, kw):
        headers = dict(kw.pop("headers", {}) or {})
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def request(self, method, url, **kw):
        headers = self._headers(kw)
        self.client.cookies.clear()
        r = self.client.request(method, url, headers=headers, **kw)
        token = r.cookies.get("glucosync_session")
        if token and r.status_code == 200 and "/login" in url:
            self.token = token
        self.client.cookies.clear()
        return r

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def put(self, url, **kw):
        return self.request("PUT", url, **kw)


@pytest.fixture
def make_client(app_client):
    return lambda: UserSession(app_client)


def signup(client, consent=False, name="Test Patient"):
    email = f"user-{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/api/auth/patient/signup", json={
        "full_name": name, "email": email, "contact_number": "+919812345678",
        "password": PASSWORD, "confirm_password": PASSWORD, "his_consent": consent,
    })
    assert r.status_code == 201, r.text
    return email, r.json()["patient"]["patient_id"]


def login_patient(client, email, password=PASSWORD):
    r = client.post("/api/auth/patient/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def login_staff(client, staff_id, role, password="Demo123!"):
    r = client.post("/api/auth/staff/login", json={"staff_id": staff_id, "password": password, "role": role})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def patient(make_client):
    c = make_client()
    email, pid = signup(c)
    login_patient(c, email)
    return c, pid, email


@pytest.fixture
def nurse(make_client):
    c = make_client()
    login_staff(c, "NUR001", "nurse")
    return c


@pytest.fixture
def nurse2(make_client):
    c = make_client()
    login_staff(c, "NUR002", "nurse")
    return c


@pytest.fixture
def doctor(make_client):
    c = make_client()
    login_staff(c, "DOC001", "doctor")
    return c
