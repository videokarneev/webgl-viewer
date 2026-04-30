import { Bloom, EffectComposer, Selection, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEditorStore } from '../../store/editorStore'

export function PostEffects() {
  const viewer = useEditorStore((state) => state.viewer)

  return (
    <Selection enabled>
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={viewer.bloomIntensity}
          radius={viewer.bloomRadius}
          luminanceThreshold={viewer.bloomThreshold}
          luminanceSmoothing={0.32}
          mipmapBlur
        />
        <ToneMapping
          mode={ToneMappingMode.ACES_FILMIC}
          resolution={256}
          whitePoint={viewer.toneMappingWhitePoint}
          middleGrey={0.6}
          averageLuminance={1}
          minLuminance={0.01}
          adaptationRate={viewer.toneMappingAdaptation}
        />
      </EffectComposer>
    </Selection>
  )
}
