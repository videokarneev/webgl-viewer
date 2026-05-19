import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function getBackgroundOverrideColor() {
  const value = new URL(window.location.href).searchParams.get('bg')
  if (!value) {
    return null
  }

  const normalized = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null
}

export function TransparentRawThreeDiagnostic() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const backgroundOverride = getBackgroundOverrideColor()
    renderer.setClearColor(new THREE.Color(backgroundOverride ?? '#000000'), backgroundOverride ? 1 : 0)
    renderer.setClearAlpha(backgroundOverride ? 1 : 0)

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 0, 4.5)

    const ambient = new THREE.AmbientLight(0xffffff, 0.9)
    const key = new THREE.DirectionalLight('#fff4de', 2.2)
    key.position.set(3, 4, 5)
    const fill = new THREE.DirectionalLight('#d7e7ff', 0.6)
    fill.position.set(-4, 2, 4)

    scene.add(ambient, key, fill)

    const geometry = new THREE.TorusGeometry(1.15, 0.34, 48, 160)
    const material = new THREE.MeshStandardMaterial({
      color: '#f0cf69',
      metalness: 0.82,
      roughness: 0.22,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1)
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    let frameId = 0
    const tick = () => {
      const time = performance.now() * 0.001
      mesh.rotation.y = time * 0.45
      mesh.rotation.x = Math.sin(time * 0.35) * 0.18
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(tick)
    }

    tick()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="transparent-published-viewport">
      <canvas ref={canvasRef} className="transparent-published-viewport__canvas" />
    </div>
  )
}
