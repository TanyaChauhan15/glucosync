import { test as base, expect } from '@playwright/test'

export const PASSWORD = 'Strong#Pass1'

// Every page opened through these fixtures fails the test on JavaScript errors,
// console errors, or failed/5xx API calls.
function watch(page, problems) {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('requestfailed', (r) => {
    // ERR_ABORTED = the browser cancelled an in-flight request because the page navigated/reloaded.
    if (r.url().includes('/api/') && r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) problems.push(`HTTP ${r.status()}: ${r.url()}`)
  })
}

export const test = base.extend({
  problems: async ({}, use) => {
    const problems = []
    await use(problems)
    expect(problems, 'browser errors during test').toEqual([])
  },
  page: async ({ page, problems }, use) => {
    watch(page, problems)
    await use(page)
  },
  newPage: async ({ browser, problems }, use) => {
    const contexts = []
    await use(async () => {
      const ctx = await browser.newContext()
      contexts.push(ctx)
      const p = await ctx.newPage()
      watch(p, problems)
      return p
    })
    for (const c of contexts) await c.close()
  },
})
export { expect }

let counter = 0
export async function signupViaApi(page, { consent = false, name = 'Kiran Test' } = {}) {
  const email = `e2e-${Date.now()}-${counter++}@example.com`
  const r = await page.request.post('/api/auth/patient/signup', {
    data: { full_name: name, email, contact_number: '9876543210', password: PASSWORD, confirm_password: PASSWORD, his_consent: consent },
  })
  expect(r.status()).toBe(201)
  const body = await r.json()
  return { email, patientId: body.patient.patient_id, name }
}

export async function loginPatientUI(page, email, password = PASSWORD) {
  await page.goto('/login/patient')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/patient\/dashboard/)
  await expect(page.getByTestId('ws-status')).toHaveAttribute('data-status', 'connected')
}

export async function loginStaffUI(page, staffId, role) {
  await page.goto('/login/staff')
  await page.getByTestId(`role-${role}`).click()
  await page.getByTestId('staff-id').fill(staffId)
  await page.getByTestId('staff-password').fill('Demo123!')
  await page.getByTestId('staff-submit').click()
  await expect(page).toHaveURL(new RegExp(`/${role}/dashboard`))
  await expect(page.getByTestId('ws-status')).toHaveAttribute('data-status', 'connected')
}

export async function generate(page, scenario) {
  const r = await page.request.post('/api/simulation/generate-reading', { data: { scenario } })
  expect(r.status()).toBe(200)
  return r.json()
}

export async function chartCount(page, param) {
  return Number(await page.getByTestId(`chart-${param}`).getAttribute('data-points'))
}
