import { useSnackbar } from '../../stores/useSnackbar'

export default function Snackbar() {
  const { message, undoFn, dismiss } = useSnackbar()
  if (!message) return null

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="flex items-center gap-3 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-2xl px-4 py-3 shadow-lg pointer-events-auto max-w-sm w-full">
        <span className="flex-1 truncate">{message}</span>
        {undoFn && (
          <button
            onClick={async () => {
              dismiss()
              await undoFn()
            }}
            className="font-semibold text-indigo-300 active:text-indigo-200 flex-shrink-0"
          >
            เลิกทำ
          </button>
        )}
        <button onClick={dismiss} className="text-gray-400 flex-shrink-0">✕</button>
      </div>
    </div>
  )
}
