'use client'

import { CanvasWrapper } from '../components/CanvasWrapper'
import { VoiceCommandCenter } from '../components/VoiceCommandCenter'

export default function Home() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <CanvasWrapper />
      <VoiceCommandCenter />
    </div>
  )
}
