import React from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variantClass = `btn-${variant}`

  const sizeClass = {
    sm: 'text-xs px-3 py-1.5',
    md: '',
    lg: 'text-base px-6 py-3',
  }[size]

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex flex-row items-center gap-2 whitespace-nowrap ${variantClass} ${sizeClass} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}
