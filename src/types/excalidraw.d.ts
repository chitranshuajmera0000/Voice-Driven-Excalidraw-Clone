export type ExcalidrawElement = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  fontSize?: number
  fontFamily?: number
  textAlign?: string
  verticalAlign?: string
  containerId?: string | null
  zoom?: {
    value: number
  } 
  originalText?: string
  baseline?: number
  [key: string]: any
}

export type ExcalidrawAPIRef = {
  getSceneElements(): ExcalidrawElement[]
  getAppState(): {
    scrollX?: number
    scrollY?: number
    zoom?: {
      value: number
    }
    [key: string]: any
  }
  updateScene(scene: {
    elements?: ExcalidrawElement[]
    [key: string]: any
  }): void
  resetScene(): void
}
