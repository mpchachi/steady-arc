import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { IrisLandmarks } from './types'
import { GazeEstimator } from './GazeEstimator'
import { CONFIG } from '@/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

interface FaceMeshContextValue {
  estimator: GazeEstimator
  irisLandmarks: IrisLandmarks | null
  isReady: boolean
  fps: number
  cameraError: string | null
  /** The actual video element used by MediaPipe (for stream mirroring in preview) */
  videoElement: HTMLVideoElement | null
}

const FaceMeshContext = createContext<FaceMeshContextValue | null>(null)

export function useFaceMesh(): FaceMeshContextValue {
  const ctx = useContext(FaceMeshContext)
  if (!ctx) throw new Error('useFaceMesh must be used inside FaceMeshProvider')
  return ctx
}

interface Props {
  children: React.ReactNode
}

export function FaceMeshProvider({ children }: Props) {
  // Internal ref — never shared. Camera and faceMesh own this element.
  const videoRef = useRef<HTMLVideoElement>(null)
  const estimatorRef = useRef(new GazeEstimator())
  const [irisLandmarks, setIrisLandmarks] = useState<IrisLandmarks | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [fps, setFps] = useState(0)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() })

  const handleResults = useCallback((results: AnyObj) => {
    const fpsC = fpsCounterRef.current
    fpsC.frames++
    const now = performance.now()
    if (now - fpsC.lastTime >= 1000) {
      setFps(fpsC.frames)
      fpsC.frames = 0
      fpsC.lastTime = now
    }

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setIrisLandmarks(null)
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    const iris = estimatorRef.current.extractIrisLandmarks(landmarks)
    setIrisLandmarks(iris)
  }, [])

  useEffect(() => {
    let faceMesh: AnyObj | null = null
    let camera: AnyObj | null = null
    let stopped = false

    async function init() {
      const { FaceMesh } = await import('@mediapipe/face_mesh')
      const { Camera } = await import('@mediapipe/camera_utils')

      if (stopped || !videoRef.current) return

      faceMesh = new FaceMesh({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      })

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: CONFIG.eyeTracking.refineLandmarks,
        minDetectionConfidence: CONFIG.eyeTracking.minDetectionConfidence,
        minTrackingConfidence: CONFIG.eyeTracking.minTrackingConfidence,
      })

      faceMesh.onResults(handleResults)

      // Capture a stable reference to the DOM element before Camera touches it
      const vid = videoRef.current

      camera = new Camera(vid, {
        onFrame: async () => {
          if (!stopped && faceMesh) {
            await faceMesh.send({ image: vid })
          }
        },
        width: 640,
        height: 480,
      })

      await camera.start()

      if (!stopped) {
        setIsReady(true)
        setVideoElement(vid) // expose to context for preview mirroring
      }
    }

    init().catch((err: Error) => {
      if (stopped) return
      const msg = err?.message ?? String(err)
      if (msg.includes('Could not start video source') || msg.includes('NotReadableError') || msg.includes('TrackStartError')) {
        setCameraError('La cámara está siendo usada por otra aplicación (Teams, Zoom, OBS…). Ciérrala y recarga la página.')
      } else if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setCameraError('Permiso de cámara denegado. Haz clic en el icono de cámara en la barra del navegador y permite el acceso.')
      } else {
        setCameraError(`Error de cámara: ${msg}`)
      }
      console.error('[FaceMeshProvider]', err)
    })

    return () => {
      stopped = true
      camera?.stop()
      faceMesh?.close()
    }
  }, [handleResults])

  return (
    <FaceMeshContext.Provider
      value={{
        estimator: estimatorRef.current,
        irisLandmarks,
        isReady,
        fps,
        cameraError,
        videoElement,
      }}
    >
      {/*
        This video element is INTERNAL — it must never receive a second ref.
        WebcamPreview mirrors the stream via srcObject, not via this ref.
      */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
        muted
      />
      {children}
    </FaceMeshContext.Provider>
  )
}
