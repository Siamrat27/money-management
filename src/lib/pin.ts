// Device-level PIN lock. Stored as SHA-256 hash in localStorage —
// intentionally NOT synced: it protects this device's local data.

const PIN_KEY = 'pf-pin-hash'

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
}

export function clearPin(): void {
  localStorage.removeItem(PIN_KEY)
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_KEY)
  if (!stored) return true
  return (await hashPin(pin)) === stored
}
