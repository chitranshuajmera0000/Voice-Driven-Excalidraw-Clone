'use client'

import { useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { ExcalidrawAPIRef } from '../types/excalidraw'

// Dynamically import Excalidraw to avoid SSR issues
const ExcalidrawComponent = dynamic(
  () => import('@excalidraw/excalidraw').then((mod) => mod.Excalidraw),
  { ssr: false }
)

export function CanvasWrapper() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawAPIRef | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Callback invoked by Excalidraw when the API is ready
  const handleExcalidrawAPI = useCallback((api: any) => {
    console.log('Excalidraw API callback invoked', api)
    if (api) {
      setExcalidrawAPI(api)
      try {
        if (typeof api.getSceneElements === 'function' && typeof api.updateScene === 'function') {
          ;(window as any).excalidrawAPI = api
          console.log('Excalidraw API exposed globally')
        } else {
          console.warn('Excalidraw API does not have expected methods', api)
        }
      } catch (e) {
        console.warn('Failed to expose Excalidraw API globally', e)
      }
    } else {
      console.warn('Excalidraw API callback received null')
      setExcalidrawAPI(null)
      try {
        delete (window as any).excalidrawAPI
      } catch {}
    }
  }, [])

  return (
    <div 
      ref={containerRef}
      className="w-full h-full"
      style={{ width: '100vw', height: '100vh' }}
    >
      <ExcalidrawComponent
        excalidrawAPI={handleExcalidrawAPI}
        initialData={{
          appState: {
            viewBackgroundColor: '#ffffff',
            currentItemStrokeColor: '#1e1e1e',
            currentItemBackgroundColor: 'transparent',
          },
        }}
        viewModeEnabled={false}
        zenModeEnabled={false}
        gridModeEnabled={false}
        theme="light"
      />
    </div>
  )
}
