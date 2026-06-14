import { supabase } from './supabase'

export interface ApiKeyRow {
  id: string
  label: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `pf_${hex}`
}

export function txEndpoint(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  return `${url}/functions/v1/tx`
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, prefix, created_at, last_used_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

// Creates a key, stores only its hash, returns the full key ONCE for display.
export async function createApiKey(userId: string, label: string): Promise<{ row: ApiKeyRow; fullKey: string }> {
  const fullKey = randomKey()
  const key_hash = await sha256Hex(fullKey)
  const prefix = fullKey.slice(0, 11)
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ user_id: userId, label: label.trim(), prefix, key_hash })
    .select('id, label, prefix, created_at, last_used_at')
    .single()
  if (error) throw new Error(error.message)
  return { row: data as ApiKeyRow, fullKey }
}

export async function deleteApiKey(id: string): Promise<void> {
  const { error } = await supabase.from('api_keys').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
