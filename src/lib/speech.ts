// Thin wrapper over the Web Speech API (browser-native, free) for Thai dictation.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Starts listening; returns a stop() function. Calls onResult with the final transcript.
export function startDictation(
  onResult: (text: string) => void,
  opts?: { onEnd?: () => void; onError?: (err: string) => void; lang?: string },
): () => void {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const rec = new SR()
  rec.lang = opts?.lang ?? 'th-TH'
  rec.interimResults = false
  rec.maxAlternatives = 1
  rec.onresult = (e: any) => {
    const text = e.results?.[0]?.[0]?.transcript ?? ''
    if (text) onResult(text)
  }
  rec.onerror = (e: any) => opts?.onError?.(e.error ?? 'error')
  rec.onend = () => opts?.onEnd?.()
  rec.start()
  return () => { try { rec.stop() } catch { /* already stopped */ } }
}
