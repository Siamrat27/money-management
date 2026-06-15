import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Mic } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import { LOCAL_USER_ID } from '../db/db'
import { useUserSettings } from '../hooks/useSettings'
import { useAppStore } from '../stores/useAppStore'
import { chatFinance, DEFAULT_GROQ_MODEL } from '../lib/groq'
import type { ChatMsg } from '../lib/groq'
import { buildFinanceSummary } from '../lib/financeSummary'
import { isSpeechSupported, startDictation } from '../lib/speech'
import Header from '../components/layout/Header'
import Button from '../components/ui/Button'

const SUGGESTIONS = [
  'เดือนนี้ใช้จ่ายไปเท่าไหร่?',
  'ออมได้กี่บาทเดือนนี้?',
  'หมวดไหนใช้เกินงบบ้าง?',
  'เทียบกับเดือนที่แล้วเป็นยังไง?',
]

export default function AiChat() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  const settings = useUserSettings()
  const { setSubPage } = useAppStore()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])

  const enabled = !!settings?.groqApiKey

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy || !settings?.groqApiKey) return
    setInput('')
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setBusy(true)
    try {
      const summary = await buildFinanceSummary(userId)
      const reply = await chatFinance(settings.groqApiKey, settings.groqModel || DEFAULT_GROQ_MODEL, next, summary)
      setMessages((m) => [...m, { role: 'assistant', content: reply || 'ขออภัย ตอบไม่ได้ตอนนี้' }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ เชื่อมต่อ AI ไม่ได้ — ตรวจ Groq API key ในตั้งค่า' }])
    }
    setBusy(false)
  }

  function toggleMic() {
    if (listening) { stopRef.current?.(); return }
    setListening(true)
    stopRef.current = startDictation(
      (t) => { setInput(t); send(t) },
      { onEnd: () => { setListening(false); stopRef.current = null }, onError: () => setListening(false) },
    )
  }

  return (
    <div className="min-h-screen flex flex-col pb-nav">
      <Header title="ถามการเงิน" showBack onBack={() => setSubPage(null)} />

      {!enabled ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <Sparkles size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-400 mb-1">ยังไม่ได้ตั้งค่า AI</p>
          <p className="text-xs text-gray-400 mb-4">ใส่ Groq API key ในหน้าตั้งค่าก่อนเพื่อใช้แชท</p>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-lg mx-auto w-full">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-500 mb-3">
                  <Sparkles size={26} />
                </div>
                <p className="text-sm text-gray-500 mb-4">ถามอะไรเกี่ยวกับเงินของคุณก็ได้</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-sm px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 text-sm text-gray-400 animate-pulse">กำลังคิด...</div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 max-w-lg mx-auto w-full">
            <div className="flex gap-2">
              <input
                type="text" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
                placeholder={listening ? 'กำลังฟัง...' : 'พิมพ์คำถาม...'}
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400"
              />
              {isSpeechSupported() && (
                <button onClick={toggleMic} className={`flex-shrink-0 w-11 rounded-xl flex items-center justify-center ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-indigo-500'}`}>
                  <Mic size={18} />
                </button>
              )}
              <Button onClick={() => send(input)} disabled={busy || !input.trim()} className="flex-shrink-0 !px-3">
                <Send size={18} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
