/// <reference types="vite/client" />

const _urls = import.meta.glob<string>(
  '/node_modules/flag-icons/flags/4x3/*.svg',
  { query: '?url', import: 'default', eager: true }
)

export function getFlagUrl(code: string): string {
  return _urls[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`] ?? ''
}
