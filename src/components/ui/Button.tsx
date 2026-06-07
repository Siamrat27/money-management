import type { ReactNode, ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  fullWidth?: boolean
}

const variants = {
  primary: 'bg-indigo-500 text-white active:bg-indigo-600 disabled:opacity-50',
  secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 active:bg-gray-200 dark:active:bg-gray-700',
  ghost: 'text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800',
  danger: 'bg-red-500 text-white active:bg-red-600',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-5 py-3.5 text-lg rounded-2xl',
}

export default function Button({ variant = 'primary', size = 'md', children, fullWidth, className = '', ...props }: Props) {
  return (
    <button
      {...props}
      className={`font-medium transition-colors select-none ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
