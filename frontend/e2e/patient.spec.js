import { PASSWORD, chartCount, expect, generate, loginPatientUI, signupViaApi, test } from './fixtures'

test('Test 1: patient registration through the UI, then login', async ({ page }) => {
  const email = `signup-${Date.now()}@example.com`
  await page.goto('/')
  await page.getByTestId('choose-signup').click()
  await expect(page).toHaveURL(/\/signup/)

  // validation errors first
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('error-full_name')).toBeVisible()
  await expect(page.getByTestId('error-email')).toBeVisible()
  await expect(page.getByTestId('signup-consent')).not.toBeChecked() // unchecked by default

  await page.getByTestId('signup-full_name').fill('Neha Kulkarni')
  await page.getByTestId('signup-contact_number').fill('+91 98200 12345')
  await page.getByTestId('signup-email').fill(email)
  await page.getByTestId('signup-password').fill(PASSWORD)
  await page.getByTestId('signup-confirm_password').fill('Mismatch#1')
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('error-confirm_password')).toHaveText(/do not match/)
  await page.getByTestId('signup-confirm_password').fill(PASSWORD)
  await page.getByTestId('signup-consent').check()
  await page.getByTestId('signup-submit').click()

  await expect(page).toHaveURL(/\/login\/patient/)
  const msg = await page.getByTestId('signup-success').textContent()
  const pid = msg.match(/PAT\d+/)[0]
  expect(pid).toMatch(/^PAT\d{3,}$/)

  // duplicate email is rejected
  const dup = await page.request.post('/api/auth/patient/signup', { data: { full_name: 'Dup', email, contact_number: '9876543210', password: PASSWORD, confirm_password: PASSWORD } })
  expect(dup.status()).toBe(409)

  await expect(page.getByTestId('login-email')).toHaveValue(email)
  await page.getByTestId('login-password').fill(PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/patient\/dashboard/)
  await expect(page.getByTestId('patient-id')).toHaveText(pid)
  await expect(page.getByTestId('patient-name')).toHaveText('Neha Kulkarni')

  // database record via API: generated ID and consent status saved
  const me = await (await page.request.get('/api/patients/me')).json()
  expect(me.patient_id).toBe(pid)
  expect(me.email).toBe(email)
  expect(me.his_consent_status).toBe('granted')
  const hist = await (await page.request.get('/api/patients/me/consent-history')).json()
  expect(hist.items).toHaveLength(1)
  expect(hist.items[0].change_source).toBe('signup')
})

test('Test 2: start simulation, graphs update live, stop halts readings', async ({ page }) => {
  const p = await signupViaApi(page)
  await loginPatientUI(page, p.email)
  await page.getByTestId('range-15').click()
  await expect(page.getByTestId('sim-state')).toHaveAttribute('data-running', 'false')
  await expect(page.getByTestId('sim-stop')).toBeDisabled()

  await page.getByTestId('sim-start').click()
  await expect(page.getByTestId('sim-state')).toHaveAttribute('data-running', 'true')
  await expect(page.getByTestId('sim-start')).toBeDisabled()
  for (const param of ['glucose', 'heart_rate', 'spo2']) {
    await expect.poll(() => chartCount(page, param), { timeout: 20_000 }).toBeGreaterThanOrEqual(3)
  }
  await expect(page.getByTestId('vital-glucose-value')).not.toHaveText('—')
  const before = await chartCount(page, 'glucose')
  await expect.poll(() => chartCount(page, 'glucose'), { timeout: 15_000 }).toBeGreaterThan(before) // keeps updating, no refresh

  await page.getByTestId('sim-stop').click()
  await expect(page.getByTestId('sim-state')).toHaveAttribute('data-running', 'false')
  await page.waitForTimeout(800)
  const stored = (await (await page.request.get(`/api/patients/${p.patientId}/readings?minutes=15`)).json()).items.length
  expect(stored).toBeGreaterThanOrEqual(4)
  await page.waitForTimeout(3000)
  const after = (await (await page.request.get(`/api/patients/${p.patientId}/readings?minutes=15`)).json()).items.length
  expect(after).toBe(stored)
  expect(await chartCount(page, 'glucose')).toBe(stored)

  // refresh: history reloads from the database
  await page.reload()
  await page.getByTestId('range-15').click()
  await expect.poll(() => chartCount(page, 'heart_rate')).toBe(stored)
  await expect(page.getByTestId('sim-state')).toHaveAttribute('data-running', 'false')
})

test('Tests 3 and 4: yellow/orange/red alerts are saved and history persists', async ({ page }) => {
  const p = await signupViaApi(page)
  await loginPatientUI(page, p.email)
  for (const sev of ['yellow', 'orange', 'red']) {
    await page.getByTestId(`demo-${sev}`).click()
    await expect(page.getByTestId(`toast-${sev}`).filter({ hasText: 'alert ALT' }).first()).toBeVisible()
  }
  await expect(page.locator('.abnormal-point').first()).toBeVisible()

  await page.getByTestId('nav-alert-history').click()
  await expect(page).toHaveURL(/\/patient\/alerts/)
  const rows = page.getByTestId('alert-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toHaveAttribute('data-severity', 'red')
  await expect(rows.nth(1)).toHaveAttribute('data-severity', 'orange')
  await expect(rows.nth(2)).toHaveAttribute('data-severity', 'yellow')
  for (let i = 0; i < 3; i++) await expect(rows.nth(i)).toHaveAttribute('data-status', 'pending')

  // details: date, time, parameters, severity
  await rows.nth(0).getByTestId('alert-details-btn').click()
  const detail = page.getByTestId('alert-detail')
  await expect(detail).toContainText('Red')
  await expect(detail).toContainText('Triggered by')
  await expect(detail).toContainText(new Date().getFullYear().toString())
  await expect(detail).toContainText(/\d{1,2}:\d{2}:\d{2}/)
  await page.getByTestId('modal-close').click()

  // filters
  await page.getByTestId('filter-severity').selectOption('orange')
  await expect(rows).toHaveCount(1)
  await page.getByTestId('filter-reset').click()
  await expect(rows).toHaveCount(3)

  // API confirms the stored alerts
  const api = await (await page.request.get(`/api/patients/${p.patientId}/alerts`)).json()
  expect(api.items.map((a) => a.overall_severity)).toEqual(['red', 'orange', 'yellow'])

  // Test 4: refresh, then logout/login
  await page.reload()
  await expect(rows).toHaveCount(3)
  await page.getByTestId('nav-logout').click()
  await expect(page).toHaveURL(/\/$/)
  expect((await page.request.get('/api/patients/me')).status()).toBe(401)
  await loginPatientUI(page, p.email)
  await page.getByTestId('nav-alert-history').click()
  await expect(rows).toHaveCount(3)
  await page.getByTestId('back-to-dashboard').click()
  await expect(page).toHaveURL(/\/patient\/dashboard/)
  // patients cannot acknowledge: no button anywhere
  await expect(page.getByTestId('acknowledge-patient')).toHaveCount(0)
})

test('Test 8: consent and privacy toggle persists', async ({ page }) => {
  const p = await signupViaApi(page, { consent: false })
  await loginPatientUI(page, p.email)
  await page.getByTestId('nav-consent-privacy').click()
  await expect(page).toHaveURL(/\/patient\/consent/)
  await expect(page.getByTestId('consent-status')).toHaveAttribute('data-status', 'declined')
  await expect(page.getByTestId('consent-save')).toBeDisabled()

  await page.getByTestId('consent-toggle').check()
  await page.getByTestId('consent-save').click()
  await expect(page.getByTestId('toast-success').filter({ hasText: 'Consent granted' }).first()).toBeVisible()
  await expect(page.getByTestId('consent-status')).toHaveAttribute('data-status', 'granted')
  expect((await (await page.request.get('/api/patients/me/consent')).json()).consent_status).toBe('granted')

  await page.getByTestId('consent-toggle').uncheck()
  await page.getByTestId('consent-save').click()
  await expect(page.getByTestId('consent-status')).toHaveAttribute('data-status', 'withdrawn')
  expect((await (await page.request.get('/api/patients/me/consent')).json()).consent_status).toBe('withdrawn')

  await page.reload()
  await expect(page.getByTestId('consent-status')).toHaveAttribute('data-status', 'withdrawn')
  await expect(page.getByTestId('consent-toggle')).not.toBeChecked()
  await expect(page.getByTestId('consent-history-row')).toHaveCount(3)
})

test('Seeded demo patient logs in and sees 24 hours of history immediately', async ({ page }) => {
  await loginPatientUI(page, 'aarav@demo.local', 'Demo123!')
  await expect(page.getByTestId('patient-id')).toHaveText('PAT001')
  await page.getByTestId('range-1440').click()
  for (const param of ['glucose', 'heart_rate', 'spo2']) {
    await expect.poll(() => chartCount(page, param)).toBeGreaterThan(250)
  }
  await page.getByTestId('nav-alert-history').click()
  await expect(page.locator('[data-testid=alert-row][data-status=pending][data-severity=red]').first()).toBeVisible()
})
