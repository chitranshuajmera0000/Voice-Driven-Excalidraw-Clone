import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Voice-Driven AI Excalidraw Clone',
  description: 'A collaborative whiteboard application powered by voice and AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
