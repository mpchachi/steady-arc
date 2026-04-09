import { useRef, useEffect } from 'react'
import { useFaceMesh } from '@/core/eyeTracking/FaceMeshProvider'

/**
 * Mirrors the MediaPipe video stream by copying srcObject.
 * Uses its own <video> element — never shares the ref with FaceMeshProvider.
 */
export function WebcamPreview() {
  const { videoElement } = useFaceMesh()
  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!videoElement || !previewRef.current) return

    function attach() {
      const preview = previewRef.current
      if (!preview || !videoElement) return
      if (videoElement.srcObject) {
        preview.srcObject = videoElement.srcObject
        preview.play().catch(() => { /* autoplay policy — muted so this should succeed */ })
        return true
      }
      return false
    }

    // Try immediately, then poll until the stream is available
    if (attach()) return

    const id = setInterval(() => {
      if (attach()) clearInterval(id)
    }, 200)

    return () => clearInterval(id)
  }, [videoElement])

  return (
    <video
      ref={previewRef}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 160,
        height: 120,
        borderRadius: 8,
        opacity: 0.65,
        objectFit: 'cover',
        transform: 'scaleX(-1)',
        border: '1px solid rgba(255,255,255,0.15)',
        pointerEvents: 'none',
      }}
      playsInline
      muted
    />
  )
}
