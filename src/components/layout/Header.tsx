import { Moon, Sun, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'

interface Props {
  title: string
  showBack?: boolean
  onBack?: () => void
  right?: React.ReactNode
}

export default function Header({ title, showBack, onBack, right }: Props) {
  const { darkMode, toggleDark, setSubPage } = useAppStore()

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          {showBack && (
            <button onClick={() => onBack ? onBack() : setSubPage(null)} className="p-1 -ml-1 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
              <ArrowLeft size={22} />
            </button>
          )}
          <h1 className="text-lg font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          {right}
          <button onClick={toggleDark} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>
    </header>
  )
}
