import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

function DiagnosticTorus() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (!meshRef.current) {
      return
    }

    meshRef.current.rotation.y += delta * 0.45
    meshRef.current.rotation.x = Math.sin(performance.now() * 0.00035) * 0.18
  })

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[1.15, 0.34, 48, 160]} />
      <meshStandardMaterial color="#f0cf69" metalness={0.82} roughness={0.22} />
    </mesh>
  )
}

export function TransparentCanvasDiagnostic() {
  return (
    <div className="transparent-published-viewport">
      <Canvas
        className="transparent-published-viewport__canvas"
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 4.5], fov: 40, near: 0.1, far: 100 }}
        onCreated={({ gl, scene }) => {
          gl.domElement.style.background = 'transparent'
          gl.setClearColor(0x000000, 0)
          scene.background = null
        }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 4, 5]} intensity={2.2} color="#fff4de" />
        <directionalLight position={[-4, 2, 4]} intensity={0.6} color="#d7e7ff" />
        <DiagnosticTorus />
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  )
}
