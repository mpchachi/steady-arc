import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { IrisLandmarks, HeadPose } from './types'
import { GazeEstimator } from './GazeEstimator'
import { CONFIG } from '@/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

interface FaceMeshContextValue {
  estimator: GazeEstimator
  irisLandmarks: IrisLandmarks | null
  headPose: HeadPose | null
  isReady: boolean
  fps: number
  cameraError: string | null
  videoElement: HTMLVideoElement | null
}

const FaceMeshContext = createContext<FaceMeshContextValue | null>(null)

export function useFaceMesh(): FaceMeshContextValue {
  const ctx = useContext(FaceMeshContext)
  if (!ctx) throw new Error('useFaceMesh must be used inside FaceMeshProvider')
  return ctx
}

interface Props { children: React.ReactNode }

export function FaceMeshProvider({ children }: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const estimatorRef  = useRef(new GazeEstimator())

  const [irisLandmarks, setIrisLandmarks] = useState<IrisLandmarks | null>(null)
  const [headPose,      setHeadPose]      = useState<HeadPose | null>(null)
  const [isReady,       setIsReady]       = useState(false)
  const [fps,           setFps]           = useState(0)
  const [videoElement,  setVideoElement]  = useState<HTMLVideoElement | null>(null)
  const [cameraError,   setCameraError]   = useState<string | null>(null)

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
      setHeadPose(null)
      return
    }

    const landmarks = results.multiFaceLandmarks[0]
    setIrisLandmarks(estimatorRef.current.extractIrisLandmarks(landmarks))
    setHeadPose(estimatorRef.current.estimateHeadPose(landmarks))
  }, [])

  useEffect(() => {
    let faceMesh: AnyObj | null = null
    let camera:   AnyObj | null = null
    let stopped = false

    async function init() {
      const { FaceMesh } = await import('@mediapipe/face_mesh')
      const { Camera }   = await import('@mediapipe/camera_utils')

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

      const vid = videoRef.current

      camera = new Camera(vid, {
        onFrame: async () => {
          if (!stopped && faceMesh) await faceMesh.send({ image: vid })
        },
        width: 640,
        height: 480,
      })

      await camera.start()

      if (!stopped) {
        setIsReady(true)
        setVideoElement(vid)
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
    })

    return () => {
      stopped = true
      camera?.stop()
      faceMesh?.close()
    }
  }, [handleResults])

  return (
    <FaceMeshContext.Provider value={{
      estimator: estimatorRef.current,
      irisLandmarks,
      headPose,
      isReady,
      fps,
      cameraError,
      videoElement,
    }}>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      {children}
    </FaceMeshContext.Provider>
  )
}
