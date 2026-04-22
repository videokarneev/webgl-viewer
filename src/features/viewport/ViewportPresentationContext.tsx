import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToneMappingMode = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces'

type ViewportPresentationValue = {
  toneMapping: ToneMappingMode
  setToneMapping: (value: ToneMappingMode) => void
  bloomEnabled: boolean
  setBloomEnabled: (value: boolean) => void
  bloomIntensity: number
  setBloomIntensity: (value: number) => void
  bloomThreshold: number
  setBloomThreshold: (value: number) => void
  bloomSmoothing: number
  setBloomSmoothing: (value: number) => void
}

const ViewportPresentationContext = createContext<ViewportPresentationValue | null>(null)

export function ViewportPresentationProvider({ children }: { children: ReactNode }) {
  const [toneMapping, setToneMapping] = useState<ToneMappingMode>('aces')
  const [bloomEnabled, setBloomEnabled] = useState(false)
  const [bloomIntensity, setBloomIntensity] = useState(0.95)
  const [bloomThreshold, setBloomThreshold] = useState(0.72)
  const [bloomSmoothing, setBloomSmoothing] = useState(0.18)

  const value = useMemo<ViewportPresentationValue>(
    () => ({
      toneMapping,
      setToneMapping,
      bloomEnabled,
      setBloomEnabled,
      bloomIntensity,
      setBloomIntensity,
      bloomThreshold,
      setBloomThreshold,
      bloomSmoothing,
      setBloomSmoothing,
    }),
    [
      bloomEnabled,
      bloomIntensity,
      bloomSmoothing,
      bloomThreshold,
      toneMapping,
    ],
  )

  return <ViewportPresentationContext.Provider value={value}>{children}</ViewportPresentationContext.Provider>
}

export function useViewportPresentation() {
  const context = useContext(ViewportPresentationContext)
  if (!context) {
    throw new Error('useViewportPresentation must be used within ViewportPresentationProvider')
  }
  return context
}
