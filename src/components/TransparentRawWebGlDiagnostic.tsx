import { useEffect, useRef, useState } from 'react'

function getBackgroundOverrideColor() {
  const value = new URL(window.location.href).searchParams.get('bg')
  if (!value) {
    return null
  }

  const normalized = value.startsWith('#') ? value : `#${value}`
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : null
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to create shader.')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error.'
    gl.deleteShader(shader)
    throw new Error(message)
  }

  return shader
}

export function TransparentRawWebGlDiagnostic() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [info, setInfo] = useState('Checking WebGL alpha...')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    })

    if (!gl) {
      setInfo('WebGL context unavailable.')
      return
    }

    const contextAttributes = gl.getContextAttributes()

    const backgroundOverride = getBackgroundOverrideColor()
    const clearColor = backgroundOverride ? hexToRgb(backgroundOverride) : { r: 0, g: 0, b: 0 }
    const clearAlpha = backgroundOverride ? 1 : 0

    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      `
        attribute vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `,
    )
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        uniform float time;
        void main() {
          vec2 uv = gl_FragCoord.xy / vec2(900.0, 900.0);
          gl_FragColor = vec4(1.0, 0.82 + 0.12 * sin(time), 0.25, 1.0);
        }
      `,
    )

    const program = gl.createProgram()
    if (!program) {
      return
    }

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -0.8, -0.65,
        0.8, -0.65,
        0, 0.8,
      ]),
      gl.STATIC_DRAW,
    )

    const positionLocation = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    const timeLocation = gl.getUniformLocation(program, 'time')

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1)
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1)
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    let frameId = 0
    let didSample = false
    const tick = () => {
      gl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearAlpha)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(timeLocation, performance.now() * 0.001)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!didSample) {
        didSample = true
        const pixel = new Uint8Array(4)
        gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        setInfo(
          [
            `context alpha: ${String(contextAttributes?.alpha)}`,
            `premultiplied: ${String(contextAttributes?.premultipliedAlpha)}`,
            `clear alpha: ${clearAlpha}`,
            `corner pixel rgba: ${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`,
          ].join(' | '),
        )
      }

      frameId = window.requestAnimationFrame(tick)
    }

    tick()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
    }
  }, [])

  return (
    <div className="transparent-published-viewport">
      <canvas ref={canvasRef} className="transparent-published-viewport__canvas" />
      <div className="transparent-webgl-diagnostic">{info}</div>
    </div>
  )
}
