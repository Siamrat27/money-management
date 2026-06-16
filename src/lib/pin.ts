// Device-level PIN lock. Stored as SHA-256 hash in localStorage —
// intentionally NOT synced: it protects this device's local data.

const PIN_KEY = 'pf-pin-hash'
const LAST_ACTIVE_KEY = 'pf-last-active'

// Re-lock only after this much inactivity (a quick page refresh stays unlocked)
export const LOCK_AFTER_MS = 5 * 60 * 1000

// Record that the app is being actively used (called periodically while open)
export function markActive(): void {
  if (hasPin()) localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
}

// Should the app show the lock screen right now (on load / on returning)?
export function shouldLockNow(): boolean {
  if (!hasPin()) return false
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0)
  return Date.now() - last > LOCK_AFTER_MS
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode('pocketflow:' + pin)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hasPin(): boolean {
  return !!localStorage.getItem(PIN_KEY)
}

export async function setPin(pin: string): Promise<void> {
  localStorage.setItem(PIN_KEY, await hashPin(pin))
  markActive() // just set it while using the app — don't immediately re-lock
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY)
  localStorage.removeItem(LAST_ACTIVE_KEY)
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_KEY)
  if (!stored) return true
  return (await hashPin(pin)) === stored
}
