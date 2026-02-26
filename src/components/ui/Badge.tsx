import React from 'react'

interface BadgeProps {
  children?: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'beaufort'
  beaufortForce?: number
  className?: string
}

export function Badge({ children, variant = 'default', beaufortForce, className = '' }: BadgeProps) {
  if (variant === 'beaufort' && beaufortForce !== undefined) {
    return (
      <span className={`badge beaufort-${beaufortForce} ${className}`}>
        Bft {beaufortForce}
      </span>
    )
  }

  const variantClass = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    beaufort: '',
  }[variant]

  return (
    <span className={`badge ${variantClass} ${className}`}>
      {children}
    </span>
  )
}
