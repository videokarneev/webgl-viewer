import { useEffect, useRef } from 'react'
import { useEditorStore } from '../store/editorStore'

function tryPlayAudio(audio: HTMLAudioElement, onBlocked: () => void) {
  const playResult = audio.play()
  if (typeof playResult?.catch === 'function') {
    void playResult.catch(() => {
      onBlocked()
    })
  }
}

export function BackgroundAudioController({ autoplay = false }: { autoplay?: boolean }) {
  const backgroundAudio = useEditorStore((state) => state.backgroundAudio)
  const setBackgroundAudio = useEditorStore((state) => state.setBackgroundAudio)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackBlockedRef = useRef(false)
  const lastSourceRef = useRef<string | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.autoplay = autoplay
    audio.crossOrigin = 'anonymous'
    audio.setAttribute('playsinline', 'true')
    audioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.loop = backgroundAudio.loop
    audio.volume = backgroundAudio.volume

    const shouldPlay = autoplay ? backgroundAudio.enabled : backgroundAudio.enabled && backgroundAudio.previewPlaying

    if (!shouldPlay || !backgroundAudio.previewEnabled || !backgroundAudio.assetUrl) {
      playbackBlockedRef.current = false
      audio.pause()
      lastSourceRef.current = null
      if (!backgroundAudio.assetUrl) {
        audio.removeAttribute('src')
        audio.load()
      }
      return
    }

    if (lastSourceRef.current !== backgroundAudio.assetUrl) {
      lastSourceRef.current = backgroundAudio.assetUrl
      playbackBlockedRef.current = false
      audio.src = backgroundAudio.assetUrl
      audio.load()
      setBackgroundAudio({
        previewCurrentTime: 0,
        previewDuration: 0,
      })
    }

    const clampedTargetTime =
      backgroundAudio.previewDuration > 0
        ? Math.min(Math.max(backgroundAudio.previewCurrentTime, 0), backgroundAudio.previewDuration)
        : Math.max(backgroundAudio.previewCurrentTime, 0)

    if (Math.abs(audio.currentTime - clampedTargetTime) > 0.25) {
      audio.currentTime = clampedTargetTime
    }

    tryPlayAudio(audio, () => {
      playbackBlockedRef.current = true
    })
  }, [
    backgroundAudio.assetUrl,
    autoplay,
    backgroundAudio.enabled,
    backgroundAudio.loop,
    backgroundAudio.previewCurrentTime,
    backgroundAudio.previewDuration,
    backgroundAudio.previewEnabled,
    backgroundAudio.previewPlaying,
    backgroundAudio.volume,
    setBackgroundAudio,
  ])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const shouldPlay = () => (autoplay ? backgroundAudio.enabled : backgroundAudio.enabled && backgroundAudio.previewPlaying)
    const attemptPlayback = () => {
      if (!shouldPlay() || !backgroundAudio.previewEnabled || !backgroundAudio.assetUrl) {
        return
      }

      tryPlayAudio(audio, () => {
        playbackBlockedRef.current = true
      })
    }

    const handleReady = () => {
      attemptPlayback()
    }

    audio.addEventListener('loadedmetadata', handleReady)
    audio.addEventListener('loadeddata', handleReady)
    audio.addEventListener('canplay', handleReady)
    audio.addEventListener('canplaythrough', handleReady)

    return () => {
      audio.removeEventListener('loadedmetadata', handleReady)
      audio.removeEventListener('loadeddata', handleReady)
      audio.removeEventListener('canplay', handleReady)
      audio.removeEventListener('canplaythrough', handleReady)
    }
  }, [autoplay, backgroundAudio.assetUrl, backgroundAudio.enabled, backgroundAudio.previewEnabled, backgroundAudio.previewPlaying])

  useEffect(() => {
    const retryPlayback = () => {
      if (!playbackBlockedRef.current) {
        return
      }

      const audio = audioRef.current
      const shouldPlay = autoplay ? backgroundAudio.enabled : backgroundAudio.enabled && backgroundAudio.previewPlaying
      if (!audio || !shouldPlay || !backgroundAudio.previewEnabled || !backgroundAudio.assetUrl) {
        playbackBlockedRef.current = false
        return
      }

      tryPlayAudio(audio, () => {
        playbackBlockedRef.current = true
      })
      playbackBlockedRef.current = false
    }

    window.addEventListener('pointerdown', retryPlayback)
    window.addEventListener('touchstart', retryPlayback, { passive: true })
    window.addEventListener('mousedown', retryPlayback)
    window.addEventListener('wheel', retryPlayback, { passive: true })
    window.addEventListener('keydown', retryPlayback)
    window.addEventListener('focus', retryPlayback)
    window.addEventListener('pageshow', retryPlayback)
    document.addEventListener('visibilitychange', retryPlayback)

    return () => {
      window.removeEventListener('pointerdown', retryPlayback)
      window.removeEventListener('touchstart', retryPlayback)
      window.removeEventListener('mousedown', retryPlayback)
      window.removeEventListener('wheel', retryPlayback)
      window.removeEventListener('keydown', retryPlayback)
      window.removeEventListener('focus', retryPlayback)
      window.removeEventListener('pageshow', retryPlayback)
      document.removeEventListener('visibilitychange', retryPlayback)
    }
  }, [autoplay, backgroundAudio.assetUrl, backgroundAudio.enabled, backgroundAudio.previewEnabled, backgroundAudio.previewPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const syncTime = () => {
      setBackgroundAudio({
        previewCurrentTime: audio.currentTime,
        previewDuration: Number.isFinite(audio.duration) ? audio.duration : 0,
      })
    }

    const syncEnded = () => {
      if (audio.loop) {
        return
      }

      setBackgroundAudio({
        previewPlaying: false,
        previewCurrentTime: audio.currentTime,
        previewDuration: Number.isFinite(audio.duration) ? audio.duration : 0,
      })
    }

    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('loadedmetadata', syncTime)
    audio.addEventListener('durationchange', syncTime)
    audio.addEventListener('ended', syncEnded)

    return () => {
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('loadedmetadata', syncTime)
      audio.removeEventListener('durationchange', syncTime)
      audio.removeEventListener('ended', syncEnded)
    }
  }, [setBackgroundAudio])

  return null
}
