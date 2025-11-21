export {}

declare global {
  interface SpeechRecognition {
    continuous: boolean
    interimResults: boolean
    lang: string
    onstart: ((event: Event) => void) | null
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
  }

  interface SpeechRecognitionEvent {
    resultIndex: number
    results: {
      length: number
      [index: number]: {
        length: number
        [index: number]: {
          transcript: string
        }
      }
    }
  }

  interface SpeechRecognitionErrorEvent {
    error: string
  }

  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition
    }
    webkitSpeechRecognition: {
      new (): SpeechRecognition
    }
  }
}
