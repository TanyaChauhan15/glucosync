import { expect, generate, loginPatientUI, loginStaffUI, signupViaApi, test } from './fixtures'

test('Test 5: nurse receives live notification and queue update without refresh', async ({ page, newPage }) => {
  const patientPage = await newPage()
  const p = await signupViaApi(patientPage, { name: 'Live Alert Patient' })
  await loginPatientUI(patientPage, p.email)

  await loginStaffUI(page, 'NUR001', 'nurse')
  const unread = async () => (await page.getByTestId('unread-count').count()) ? Number(await page.getByTestId('unread-count').textContent()) : 0
  const before = await unread()
  await expect(page.locator(`[data-testid=queue-card][data-patient-id=${p.patientId}]`)).toHaveCount(0)

  await patientPage.getByTestId('demo-red').click()

  await expect.poll(unread).toBe(before + 1)
  const card = page.locator(`[data-testid=queue-card][data-patient-id=${p.patientId}]`)
  await expect(card).toHaveCount(1)
  await expect(card.getByTestId('queue-pending-count')).toHaveText('1')
  await expect(card.getByTestId('queue-highest')).toHaveAttribute('data-severity', 'red')
  await expect(page.getByTestId('toast-red').first()).toBeVisible()
  await expect(page.getByTestId('urgent-banner')).toContainText(p.patientId)

  // bell: open, mark one as read; reading does not acknowledge
  await page.getByTestId('notification-bell').click()
  const item = page.getByTestId('notification-item').filter({ hasText: p.patientId }).first()
  await expect(item).toHaveAttribute('data-read', 'false')
  await item.getByTestId('mark-read').click()
  await expect(item).toHaveAttribute('data-read', 'true')
  await expect.poll(unread).toBe(before)
  await expect(card.getByTestId('queue-pending-count')).toHaveText('1')
})

test('Tests 6 and 7: one acknowledgement per patient covers all pending alerts; new alert reopens', async ({ page, newPage }) => {
  const patientPage = await newPage()
  const p = await signupViaApi(patientPage, { name: 'Ack Batch Patient' })
  await loginPatientUI(patientPage, p.email)
  for (const sev of ['yellow', 'orange', 'red', 'orange', 'red']) await generate(patientPage, sev)

  const doctorPage = await newPage()
  await loginStaffUI(doctorPage, 'DOC001', 'doctor')
  await doctorPage.goto(`/doctor/patients/${p.patientId}`)
  await expect(doctorPage.getByTestId('details-pending-count')).toHaveText('5')

  await loginStaffUI(page, 'NUR001', 'nurse')
  const cards = page.locator(`[data-testid=queue-card][data-patient-id=${p.patientId}]`)
  await expect(cards).toHaveCount(1) // exactly one entry for the patient
  await expect(cards.getByTestId('queue-pending-count')).toHaveText('5')
  await expect(cards.getByTestId('queue-highest')).toHaveAttribute('data-severity', 'red')
  await expect(cards.getByTestId('acknowledge-patient')).toHaveCount(1) // exactly one button
  // a second nurse's dashboard is open too
  const nurse2 = await newPage()
  await loginStaffUI(nurse2, 'NUR002', 'nurse')
  const card2 = nurse2.locator(`[data-testid=queue-card][data-patient-id=${p.patientId}]`)
  await expect(card2.getByTestId('queue-pending-count')).toHaveText('5')

  await cards.getByTestId('acknowledge-patient').click()
  await expect(page.getByTestId('toast-success').filter({ hasText: 'Acknowledged 5 pending alert(s)' }).first()).toBeVisible()
  await expect(cards.getByTestId('queue-pending-count')).toHaveText('0')
  await expect(cards.getByTestId('queue-acknowledged')).toBeVisible()
  await expect(cards.getByTestId('acknowledge-patient')).toBeDisabled()
  await expect(cards.getByTestId('queue-last-ack')).toContainText('NUR001')
  // other nurse's dashboard updates live
  await expect(card2.getByTestId('queue-pending-count')).toHaveText('0')

  // database: five alerts kept, all acknowledged in one batch
  const stored = await (await page.request.get(`/api/patients/${p.patientId}/alerts?page_size=100`)).json()
  expect(stored.total).toBe(5)
  expect(new Set(stored.items.map((a) => a.alert_status))).toEqual(new Set(['acknowledged']))
  expect(new Set(stored.items.map((a) => a.acknowledgement_batch_id)).size).toBe(1)
  expect(new Set(stored.items.map((a) => a.acknowledged_by))).toEqual(new Set(['NUR001']))

  // patient view shows acknowledged; doctor view shows acknowledgement history (live)
  await patientPage.getByTestId('nav-alert-history').click()
  await expect(patientPage.locator('[data-testid=alert-row][data-status=acknowledged]')).toHaveCount(5)
  await expect(patientPage.getByTestId('alert-row').first()).toContainText('NUR001')
  await expect(doctorPage.getByTestId('details-pending-count')).toHaveText('0')
  await expect(doctorPage.getByTestId('ack-row')).toHaveCount(1)
  await expect(doctorPage.getByTestId('ack-row')).toContainText('NUR001')
  await expect(doctorPage.getByTestId('acknowledge-patient')).toHaveCount(0)

  // Test 7: a new abnormal reading reopens the patient's queue entry
  await generate(patientPage, 'yellow')
  await expect(cards.getByTestId('queue-pending-count')).toHaveText('1')
  await expect(cards.getByTestId('queue-highest')).toHaveAttribute('data-severity', 'yellow')
  await expect(cards.getByTestId('acknowledge-patient')).toBeEnabled()
  await expect(patientPage.locator('[data-testid=alert-row][data-status=acknowledged]')).toHaveCount(5)
  await expect(patientPage.locator('[data-testid=alert-row][data-status=pending]')).toHaveCount(1)
  const after = await (await page.request.get(`/api/patients/${p.patientId}/alerts?status=acknowledged`)).json()
  expect(after.total).toBe(5)
})

test('Test 9: doctor sees patients, details, graphs and history, but no controls', async ({ page }) => {
  await loginStaffUI(page, 'DOC001', 'doctor')
  await expect(page.getByTestId('doctor-patient-card').first()).toBeVisible()
  for (const id of ['PAT001', 'PAT002', 'PAT003', 'PAT004']) await expect(page.locator(`[data-testid=doctor-patient-card][data-patient-id=${id}]`)).toHaveCount(1)
  await page.getByTestId('doctor-search').fill('Aarav')
  await expect(page.getByTestId('doctor-patient-card')).toHaveCount(1)
  await page.getByTestId('doctor-view-details').click()
  await expect(page).toHaveURL(/\/doctor\/patients\/PAT001/)
  for (const param of ['glucose', 'heart_rate', 'spo2']) {
    await expect.poll(async () => Number(await page.getByTestId(`chart-${param}`).getAttribute('data-points'))).toBeGreaterThan(50)
  }
  await expect(page.locator('.abnormal-point').first()).toBeVisible()
  await expect(page.getByTestId('alert-row').first()).toBeVisible()
  await expect(page.getByTestId('ack-row').first()).toBeVisible()
  // no simulation controls, no acknowledge button for doctors
  for (const id of ['sim-start', 'sim-stop', 'sim-generate', 'demo-red', 'acknowledge-patient', 'simulation-controls']) {
    await expect(page.getByTestId(id)).toHaveCount(0)
  }
  await page.getByTestId('nav-dashboard').click()
  await expect(page.getByTestId('acknowledge-patient')).toHaveCount(0)
  await expect(page.getByTestId('sim-start')).toHaveCount(0)
  await page.getByTestId('nav-alert-history').click()
  await page.getByTestId('filter-search').fill('PAT002')
  await page.getByTestId('filter-apply').click()
  await expect(page.getByTestId('alert-row').first()).toContainText('PAT002')
})
