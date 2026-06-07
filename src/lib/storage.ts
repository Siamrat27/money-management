import { supabase, isSupabaseConfigured } from './supabase'
import { useAuthStore } from '../stores/useAuthStore'
import { LOCAL_USER_ID } from '../db/db'

export function isUrlIcon(icon: string): boolean {
  return icon.startsWith('http') || icon.startsWith('data:')
}

async function resizeToSquare(file: File, size = 256): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      canvas.toBlob((blob) => resolve(blob!), 'image/webp', 0.85)
    }
    img.src = objectUrl
  })
}

export async function uploadIcon(file: File): Promise<string> {
  const userId = useAuthStore.getState().user?.id ?? LOCAL_USER_ID
  const blob = await resizeToSquare(file)

  if (!isSupabaseConfigured || userId === LOCAL_USER_ID) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const path = `${userId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from('icons')
    .upload(path, blob, { contentType: 'image/webp' })
  if (error) throw new Error(error.message)

  return supabase.storage.from('icons').getPublicUrl(path).data.publicUrl
}
