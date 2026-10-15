# GlucoSync: Smart Remote Patient Monitoring & Hospital Alert System

> **Demonstration prototype (DH 308 project).** All readings are synthetic. GlucoSync is not a certified
> medical device and must not be used with real patient data until security, privacy, clinical-safety and
> regulatory reviews have been completed.

## 1. Project overview

GlucoSync monitors three parameters for diabetic patients in one hospital: **blood glucose (mg/dL)**,
**heart rate (BPM)** and **SpO₂ (%)**. Readings are simulated by the backend for now; the same ingestion
pipeline accepts real sensor readings later. Every reading is stored, classified as Normal / Yellow /
Orange / Red, and abnormal readings create permanent alerts. Nurses share one hospital-wide alert queue,
grouped by patient, and acknowledge a patient's pending alert group with a single button.

Roles: **Patient**, **Nurse**, **Doctor** (read-only).

## 2. Features

- Patient signup (validated, auto-generated `PATnnn` ID, optional HIS consent with timestamp), patient login by email
- Hospital staff login by Doctor ID / Nurse ID (staff accounts are provisioned, never self-registered)
- Server-side sessions in an HttpOnly cookie: refresh keeps you signed in, logout revokes the session, sessions expire
- Patient dashboard: live vital cards, three live graphs (15 min / 1 h / 6 h / 24 h) with severity-coloured points and tooltips
- Backend-controlled simulation (Start / Stop / Generate One Reading) plus Normal / Yellow / Orange / Red demo buttons
- Three-level alert engine with configurable prototype thresholds (`backend/thresholds.json`)
- Permanent alert history for all three roles, with severity, status, date and patient filters, pagination and alert details
- Nurse dashboard: statistics, **patient-grouped alert queue with one "Acknowledge Patient" button per patient**,
  urgent red banner that stays until acknowledged, escalation-overdue warning, notification bell (unread count,
  mark read, mark all read), mute/unmute sounds
- Doctor dashboard: statistics, searchable patient cards, recent alerts, patient details with graphs, pending alerts,
  alert history and nurse acknowledgement history (no simulation or acknowledgement controls)
- Consent & Privacy page with audit history; Mock HIS Integration page (sharing status, sync log, received FHIR-shaped data)
- Real-time updates over an authenticated WebSocket with automatic reconnection
- Responsive layout (desktop, tablet, mobile drawer navigation)

## 3. Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, Recharts, Lucide React, React Router 6, Axios, native WebSocket |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2 ORM, Pydantic 2, Alembic migrations, bcrypt, Uvicorn |
| Database | SQLite (development); ORM and migrations are PostgreSQL-ready |
| Tests | pytest (API, alert engine, concurrency, real server restart), Playwright (Chromium end-to-end) |

## 4. Project structure

```
glucosync/
├── .env.example                 # all settings, with safe development defaults
├── README.md
├── backend/
│   ├── main.py                  # FastAPI app, startup (migrate, seed, reconcile simulations)
│   ├── config.py                # settings from environment
│   ├── database.py              # engine, sessions, UTC datetime type
│   ├── models.py                # 10 specified tables + auth_sessions, audit_log, mock_his_records
│   ├── schemas.py               # Pydantic request validation + response serializers
│   ├── auth.py                  # bcrypt, server-side sessions, role dependencies
│   ├── migrations.py, alembic.ini, alembic/versions/0001_initial_schema.py
│   ├── thresholds.json          # prototype alert rules (configurable)
│   ├── routes/                  # auth, patients, alerts, consent, simulation, notifications, his, devices, realtime (WebSocket)
│   ├── services/
│   │   ├── alert_engine.py      # classification
│   │   ├── readings.py          # single ingestion pipeline (validate → save → classify → alert → notify → HIS → broadcast)
│   │   ├── acknowledgement.py   # atomic patient-level acknowledgement
│   │   ├── simulation.py        # per-patient background simulator
│   │   ├── notifications.py     # nurse notifications + per-nurse read receipts
│   │   ├── his_integration.py   # MOCK HIS (FHIR-shaped, LOINC-coded)
│   │   ├── queue.py             # patient-grouped queue and dashboard stats
│   │   ├── realtime.py          # WebSocket fan-out
│   │   └── seed.py              # idempotent demo data
│   ├── tests/                   # pytest suite
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── pages/               # Landing, PatientLogin, StaffLogin, PatientSignup, PatientDashboard, PatientAlertHistory,
    │   │                        # ConsentPrivacy, PatientProfile, NurseDashboard, NurseAlertHistory, DoctorDashboard,
    │   │                        # DoctorAlertHistory, PatientDetails, HISIntegration, NotFound
    │   ├── components/  services/  hooks/  context/  utils/
    │   ├── App.jsx  main.jsx
    ├── e2e/                     # Playwright tests
    ├── playwright.config.js
    └── package.json
```

## 5. Installation requirements

- **Python 3.11 or newer** (tested with 3.13) — https://www.python.org/downloads/ (tick "Add python.exe to PATH")
- **Node.js 20 or newer** (tested with 22) — https://nodejs.org/
- A modern browser (Chrome, Edge, Firefox)

## 6. Start the backend (Windows PowerShell)

```powershell
cd glucosync\backend
python -m venv venv
.\venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
Copy-Item ..\.env.example ..\.env     # optional; defaults work without it
uvicorn main:app --port 8000
```

On first start the backend creates `backend\glucosync.db`, applies migrations and seeds the demo accounts.
Keep this window open. API docs: http://localhost:8000/docs

(macOS/Linux: `source venv/bin/activate` instead of `Activate.ps1`.)

## 7. Start the frontend (second PowerShell window)

```powershell
cd glucosync\frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/ws` to the backend on port 8000.

## 8. Access the application

Open **http://localhost:5173**. Choose *Login as Patient*, *Login as Doctor / Nurse*, or *New Patient? Create an Account*.

Optional single-port mode: run `npm run build` in `frontend`, then the backend also serves the built app at http://localhost:8000
(add `http://localhost:8000` to `CORS_ORIGINS`).

## 9–11. Demo credentials (development only)

All seeded accounts use the password **`Demo123!`**.

| Role | Login | Name | Seeded state |
|---|---|---|---|
| Patient | `aarav@demo.local` | Aarav Mehta (PAT001) | pending **Red** alerts (plus older acknowledged ones); HIS consent granted |
| Patient | `priya@demo.local` | Priya Sharma (PAT002) | pending **Orange** alerts; consent granted |
| Patient | `rohan@demo.local` | Rohan Patel (PAT003) | pending **Yellow** alerts; consent declined |
| Patient | `ananya@demo.local` | Ananya Singh (PAT004) | only **acknowledged** historical alerts; consent withdrawn |
| Doctor | `DOC001` | Dr. Kavya Iyer | read-only |
| Nurse | `NUR001` | Meera Nair | |
| Nurse | `NUR002` | Arjun Rao | |

Every demo patient has 24 hours of synthetic readings (every 5 minutes) so graphs are populated immediately.
Seeding is idempotent: restarting never duplicates patients, readings or alerts.

## 12. Start and stop the simulation

Log in as a patient → Dashboard → **Start Simulation**. The backend generates a reading for that patient every
5 seconds (`SIMULATION_INTERVAL_SECONDS`), mostly normal with occasional Yellow/Orange/Red values.
**Stop Simulation** stops generation and keeps all data. Only one simulation can run per patient; the buttons
reflect the state stored in the database. **Generate One Reading** and the **Normal / Yellow / Orange / Red**
buttons create a single reading at a chosen level for safe demonstrations. Simulation endpoints are patient-only
(staff get HTTP 403) and always act on the signed-in patient. Simulations still marked running when the server
stops are marked stopped on the next start (set `SIMULATION_RESUME_ON_RESTART=true` to resume them).

## 13. How alerts are generated

Every reading (simulated or, later, from a device via `POST /api/devices/readings`) goes through one pipeline:
validate → save reading → classify glucose, heart rate and SpO₂ → overall severity = highest
(Red > Orange > Yellow > Normal) → if abnormal, create an alert (values, per-parameter severities, overall
severity, triggering parameters, source, timestamp) and a nurse notification in the **same transaction** →
optional HIS share → WebSocket broadcast of the saved state.

Prototype rules (integers, inclusive bands; **not SNOMED CT thresholds, not clinically validated**; edit `backend/thresholds.json`):

| Parameter | Normal | Yellow | Orange | Red |
|---|---|---|---|---|
| Glucose (mg/dL) | 80–180 | 70–79 or 181–250 | 54–69 or 251–300 | < 54 or > 300 |
| Heart rate (BPM) | 60–100 | 50–59 or 101–110 | 40–49 or 111–130 | < 40 or > 130 |
| SpO₂ (%) | 96–100 | 94–95 | 90–93 | < 90 |

Labels are demonstration labels, not diagnoses. Glucose above 300 mg/dL needs contextual clinical assessment.

## 14. Patient-level acknowledgement

The nurse queue shows **one card per patient** with latest vitals, pending count, highest pending severity and
last alert time, and **one Acknowledge Patient button**. Clicking it calls
`POST /api/patients/{patient_id}/acknowledge` (nurses only). In one database transaction the backend creates an
acknowledgement batch, selects that patient's currently pending alerts (taking the write lock on SQLite /
`SELECT … FOR UPDATE` on PostgreSQL), marks them acknowledged with the nurse ID, time and batch ID, records the
batch's alert count and highest severity, and writes an audit-log entry. Alerts are never deleted or merged.
If two nurses click at the same moment, exactly one processes the batch; the other receives "no pending alerts
remain". An alert created after the selection stays pending. All dashboards update through WebSockets; the
patient sees "Acknowledged" with the nurse and time; doctors see the batch in the acknowledgement history.
A later abnormal reading creates a new pending alert and reopens the patient's card. Reading a notification never
acknowledges a patient.

## 15. How alert history is stored

Alerts live in the `alerts` table (with `acknowledgement_batches`, `notifications`, `notification_receipts`).
History is read through paginated, filtered APIs (`/api/patients/{id}/alerts`, `/api/alerts`), so it survives
refreshes, logout/login, simulation stops, acknowledgements and server restarts. Patients see only their own alerts;
nurses and doctors see all patients of this hospital. Timestamps are stored in UTC and shown in `APP_TIMEZONE`
(default Asia/Kolkata).

## 16. Consent management

Signup has an optional, unchecked-by-default HIS consent checkbox. The **Consent & Privacy** page shows the current
status and its date, explains what is shared, and saves changes with **Save Changes**. Every change is appended to
`consent_history` (status, time, version, source) and the audit log. Turning consent off after granting it records
a **withdrawal**: future HIS sharing stops, local records are kept, and previously shared data is not claimed to be
deleted.

**Assumption to confirm with the hospital:** monitoring, alerting and nurse/doctor review inside GlucoSync are
treated as part of the hospital's care service, authorised by the hospital separately from this optional consent.
The HIS consent governs only the optional onward exchange to the HIS.

## 17. Mock HIS integration

`backend/services/his_integration.py` is clearly a **mock**; there is no real hospital connection. While a patient's
consent is granted, each saved reading is sent as a FHIR R4-shaped `Bundle` of `Observation`s coded with LOINC
(2339-0 glucose, 8867-4 heart rate, 59408-5 SpO₂) and each alert as a `Flag` carrying *candidate* SNOMED CT finding
codes (to be verified in a licensed release). The mock endpoint stores what it receives in `mock_his_records` and
fails on purpose at `HIS_MOCK_FAILURE_RATE` so failed syncs are visible. Every attempt is logged in `his_sync_log`.
Staff see the **Mock HIS** page (patient ID, consent, last shared reading, latest alert severity, sharing status,
last sync time, sync log, received payloads); patients see their own sharing status on the consent page.

## 18. Running the automated tests

Backend (from `glucosync\backend` with the venv active):

```powershell
python -m pytest -v
```

End-to-end (from `glucosync\frontend`; the backend venv must exist because Playwright starts its own backend on
port 8001 with a temporary database, and Vite on port 5174):

```powershell
npx playwright install chromium     # first time only
npx playwright test
npx playwright show-report          # optional HTML report
```

See `TEST_RESULTS.md` for the results of the last run.

## 19. Limitations and future improvements

- Synthetic data only; no real sensors, pulse oximeters or hospital equipment are connected. The
  `/api/devices/readings` endpoint (disabled unless `DEVICE_API_KEY` is set) is the integration point for a gateway.
- Single hospital, single backend process (the simulator runs in-process). Scaling out needs a shared job runner
  (e.g. Celery/RQ) and a pub/sub layer (e.g. Redis) for WebSocket fan-out.
- Browser notifications and sounds are not a reliable emergency dispatch channel. The escalation timer is a
  configurable placeholder; a hospital-approved escalation policy (paging, phone tree) is required.
- Alert thresholds are project rules that require clinical validation and, ideally, per-patient targets.
- The login throttle is in-memory; production needs a shared rate limiter, MFA for staff, HTTPS (`COOKIE_SECURE=true`),
  CSRF tokens in addition to SameSite cookies, an admin UI for staff provisioning, and password reset.
- HIS exchange is mocked; real integration would use an authenticated FHIR API, consent records in FHIR `Consent`, and
  licensed SNOMED CT content.
- Doctors can access all patients of this hospital; finer-grained care-team authorisation could be added.
- Legal basis, retention, and data-protection compliance (e.g. India's DPDP Act) have not been reviewed.
