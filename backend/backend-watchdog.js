const { exec } = require('child_process')

const APP_NAME = process.env.WATCHDOG_APP_NAME || 'dataCom-backend'
const HEALTH_URL = process.env.WATCHDOG_HEALTH_URL || 'http://127.0.0.1:5000/'
const CHECK_INTERVAL_MS = Number(process.env.WATCHDOG_CHECK_INTERVAL_MS || 30000)
const FAILURE_LIMIT = Number(process.env.WATCHDOG_FAILURE_LIMIT || 3)
const RESTART_COOLDOWN_MS = Number(process.env.WATCHDOG_RESTART_COOLDOWN_MS || 120000)

let failureCount = 0
let restartInProgress = false
let lastRestartAt = 0

function restartApp(reason) {
  const now = Date.now()
  if (restartInProgress || now - lastRestartAt < RESTART_COOLDOWN_MS) return

  restartInProgress = true
  lastRestartAt = now
  console.error(`[watchdog] Restarting ${APP_NAME}: ${reason}`)

  exec(`pm2 restart ${APP_NAME}`, (error, stdout, stderr) => {
    if (stdout) console.log(stdout.trim())
    if (stderr) console.error(stderr.trim())
    if (error) console.error(`[watchdog] Restart command failed: ${error.message}`)

    failureCount = 0
    restartInProgress = false
  })
}

async function checkHealth() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    if (failureCount > 0) {
      console.log(`[watchdog] ${APP_NAME} recovered`)
    }
    failureCount = 0
  } catch (error) {
    failureCount += 1
    console.error(`[watchdog] Health check failed ${failureCount}/${FAILURE_LIMIT}: ${error.message}`)

    if (failureCount >= FAILURE_LIMIT) {
      restartApp(`${FAILURE_LIMIT} failed health checks`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

console.log(`[watchdog] Monitoring ${APP_NAME} at ${HEALTH_URL}`)
checkHealth()
setInterval(checkHealth, CHECK_INTERVAL_MS)
