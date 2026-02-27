import { createContext, useContext } from 'react'
import type { NMEAData } from '../hooks/useNMEA'

interface NMEAContextValue {
  connected: boolean
  data: NMEAData
}

export const NMEAContext = createContext<NMEAContextValue>({ connected: false, data: {} })

export function useNMEAContext(): NMEAContextValue {
  return useContext(NMEAContext)
}
