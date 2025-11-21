'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface UseVoiceRecognitionOptions {
  onAutoStop?: (finalTranscript: string) => void
}

export function useVoiceRecognition(options?: UseVoiceRecognitionOptions) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const transcriptRef = useRef('')
  const isMounted = useRef(true)

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.warn('Error stopping recognition:', e)
      }
      recognitionRef.current = null
    }
    setIsListening(false)
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
  }, [])

  const resetSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }

    silenceTimeoutRef.current = setTimeout(() => {
      if (isListening && isMounted.current) {
        const finalTranscript = transcriptRef.current
        stopListening()
        if (finalTranscript.trim() && options?.onAutoStop) {
          options.onAutoStop(finalTranscript)
        }
      }
    }, 5000) // Increased from 3000ms to 5000ms for more natural pauses
  }, [isListening, options, stopListening])

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionClass) {
      console.error('Speech recognition not supported')
      return
    }

    // Stop any running recognition first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.warn('Error stopping previous recognition:', e)
      }
      recognitionRef.current = null
    }

    const recognition: SpeechRecognition = new SpeechRecognitionClass()
    recognitionRef.current = recognition

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      if (!isMounted.current) return
      console.log('Speech recognition started')
      setIsListening(true)
      setTranscript('')
      transcriptRef.current = ''
      resetSilenceTimeout()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isMounted.current) return

      let fullTranscript = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result[0]) continue
        fullTranscript += result[0].transcript
      }

      setTranscript(fullTranscript)
      transcriptRef.current = fullTranscript
      resetSilenceTimeout()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!isMounted.current) return

      console.error('Speech recognition error:', event.error)
      // Don't stop on certain recoverable errors
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        console.log('Recoverable error, continuing...')
        return
      }
      stopListening()
    }

    recognition.onend = () => {
      if (!isMounted.current) return

      // Only auto-restart if we're still supposed to be listening
      if (isListening) {
        console.log('Speech recognition service disconnected, attempting to reconnect...')
        try {
          recognition.start()
          return // Don't update state if we're reconnecting
        } catch (e) {
          console.error('Failed to restart recognition:', e)
        }
      }

      // Only update state if we're actually stopping
      console.log('Speech recognition stopped')
      setIsListening(false)
      recognitionRef.current = null
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
    }

    try {
      console.log('Starting speech recognition...')
      recognition.start()
    } catch (e) {
      console.error('Failed to start recognition, will retry...', e)
      // Auto-retry after a short delay
      setTimeout(() => {
        if (isMounted.current) {
          try {
            recognition.start()
          } catch (retryError) {
            console.error('Retry failed:', retryError)
            stopListening()
          }
        }
      }, 500)
    }
  }, [resetSilenceTimeout, stopListening])

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.warn('Error during cleanup:', e)
        }
        recognitionRef.current = null
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
    }
  }, [])

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
  }
}