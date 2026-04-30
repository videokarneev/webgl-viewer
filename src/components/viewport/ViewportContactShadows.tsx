import { ContactShadows } from '@react-three/drei'

export function ViewportContactShadows() {
  return (
    <ContactShadows
      position={[0, -0.85, 0]}
      scale={12}
      blur={1.8}
      opacity={0.42}
      far={8}
    />
  )
}
