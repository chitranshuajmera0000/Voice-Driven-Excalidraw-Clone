'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { useVoiceRecognition } from '../hooks/useVoiceRecognition'
import { handleAIResponse } from '../lib/canvas-renderer'

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | any
  timestamp: number
}

// Helper function to extract topic from AI response
function extractTopicFromResponse(aiResponse: any): string | null {
  if (!aiResponse) return null;
  
  // First check for explicit title
  if (aiResponse.title && typeof aiResponse.title === 'string') {
    return aiResponse.title.toLowerCase().trim()
      .replace(/[^a-z0-9 ]/g, '') // Remove special chars
      .replace(/\s+/g, ' ');      // Normalize spaces
  }
  
  // For multi responses, try to get a topic from the first item with a title
  if (aiResponse.type === 'multi' && Array.isArray(aiResponse.content)) {
    for (const item of aiResponse.content) {
      if (item?.title && typeof item.title === 'string') {
        return item.title.toLowerCase().trim()
          .replace(/[^a-z0-9 ]/g, '')
          .replace(/\s+/g, ' ');
      }
    }
  }
  
  // Try to extract topic from content if no title
  if (aiResponse.content) {
    const content = typeof aiResponse.content === 'string' 
      ? aiResponse.content 
      : JSON.stringify(aiResponse.content);
    const firstLine = content.split('\n')[0] || '';
    return firstLine.toLowerCase().trim()
      .replace(/^[•\-\*]\s*/, '') // Remove bullet points
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ');
  }
  
  return null;
}

// Helper function to find matching topic from existing topics
function findMatchingTopic(newTopic: string, existingTopics: string[]): string | null {
  if (!newTopic || !existingTopics.length) return null;

  const newTopicWords = newTopic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (newTopicWords.length === 0) return null;
  
  // Look for exact match first (case insensitive)
  const exactMatch = existingTopics.find(t => t.toLowerCase() === newTopic.toLowerCase());
  if (exactMatch) return exactMatch;
  
  // Calculate similarity scores for all existing topics
  const matches = existingTopics.map(topic => {
    const topicWords = topic.toLowerCase().split(/\s+/);
    
    // Calculate word overlap
    const commonWords = newTopicWords.filter(w => 
      topicWords.some(tw => tw === w || tw.startsWith(w) || w.startsWith(tw))
    );
    
    // Calculate character-level similarity (for partial matches)
    const similarity = commonWords.length / Math.max(newTopicWords.length, topicWords.length);
    
    return { topic, score: commonWords.length + similarity };
  });
  
  // Sort by score and get the best match
  matches.sort((a, b) => b.score - a.score);
  
  // If we have a strong enough match, return it
  const bestMatch = matches[0];
  if (bestMatch && bestMatch.score >= 1.5) { // Adjust threshold as needed
    return bestMatch.topic;
  }
  
  // Check for acronyms or abbreviations
  if (newTopic.length <= 5) {
    const acronymMatch = existingTopics.find(topic => {
      const acronym = topic.split(/\s+/).map(w => w[0]).join('').toLowerCase();
      return acronym === newTopic.toLowerCase();
    });
    if (acronymMatch) return acronymMatch;
  }
  
  return null;
}

export function VoiceCommandCenter() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [continuousMode, setContinuousMode] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [sessionTranscript, setSessionTranscript] = useState('')
  const [currentGroupId, setCurrentGroupId] = useState<string>('')
  
  // Topic-based groupId tracking
  const [topicToGroupId, setTopicToGroupId] = useState<Map<string, string>>(new Map())
  
  const shouldAutoRestartRef = useRef(true)
  const processTranscriptRef = useRef<((text: string) => Promise<void>) | null>(null)
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  })

  useEffect(() => {
    // Detect SpeechRecognition availability
    if (typeof window === 'undefined') return
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupported(Boolean(SpeechRecognitionClass))
    // Initialize group ID for grouping related elements
    setCurrentGroupId(`group_${Date.now()}`)
  }, [])

  const { isListening, transcript, startListening, stopListening } = useVoiceRecognition({
    onAutoStop: (finalTranscript: string) => {
      if (!finalTranscript.trim()) return

      setSessionTranscript((prev) =>
        prev ? `${prev} ${finalTranscript}` : finalTranscript,
      )

      if (continuousMode && processTranscriptRef.current) {
        void processTranscriptRef.current(finalTranscript)
      }
    },
  })

  const processTranscript = useCallback(async (text: string) => {
    if (!text.trim()) return

    setErrorMessage(null)
    setIsProcessing(true)
    
    try {
      // Add user message to history
      const userMessage: ConversationMessage = {
        role: 'user',
        content: text,
        timestamp: Date.now()
      }
      
      const updatedHistory = [...conversationHistory, userMessage]
      setConversationHistory(updatedHistory)

      const response = await fetch('/api/process-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript: text,
          conversationHistory: updatedHistory.slice(-10),
          continuousMode
        }),
      })

      let payload
      try {
        payload = await response.json()
      } catch (jsonError) {
        const errorText = await response.text().catch(() => 'Failed to parse response')
        console.error('Failed to parse response as JSON:', errorText)
        setErrorMessage('Server returned an invalid response. Please try again.')
        throw new Error('Invalid server response format')
      }

      if (!response.ok) {
        const err = payload?.error ?? 'Unknown server error'
        const rawContent = payload?.raw ? `\n\nRaw response: ${payload.raw.substring(0, 200)}...` : ''
        const errorMsg = `${err}${rawContent}`
        console.error('Server error:', err, payload)
        setErrorMessage(errorMsg.length > 200 ? errorMsg.substring(0, 200) + '...' : errorMsg)
        throw new Error(err)
      }

      if (!payload || typeof payload !== 'object') {
        console.error('Invalid response payload:', payload)
        setErrorMessage('Received invalid response from server. Please try again.')
        throw new Error('Invalid response structure')
      }

      const aiResponse = payload

      // Add AI response to history
      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now()
      }
      setConversationHistory([...updatedHistory, assistantMessage])

      const excalidrawAPI = (window as any).excalidrawAPI

      if (!excalidrawAPI || typeof excalidrawAPI.getSceneElements !== 'function') {
        setErrorMessage('Canvas not ready. Please wait for the canvas to load.')
        console.error('Excalidraw API not available on window')
        return
      }

      try {
        // Extract topic from the current AI response
        const currentTopic = extractTopicFromResponse(aiResponse)
        
        // Detect if this is an update message
        const lowerText = text.toLowerCase()
        const hasStrongUpdateKeywords = 
          lowerText.includes('correction') ||
          lowerText.includes('update') ||
          lowerText.includes('replace') ||
          lowerText.includes('modify') ||
          lowerText.includes('change') ||
          lowerText.includes('remove') ||
          lowerText.includes('scratch that') ||
          lowerText.includes('instead') ||
          lowerText.includes('wait') ||
          lowerText.includes('actually')
        
        const hasWeakUpdateKeywords = 
          lowerText.includes('also add') ||
          lowerText.includes('also include') ||
          lowerText.includes('mentioned earlier') ||
          lowerText.includes('mentioned above') ||
          lowerText.includes('add to')

        // Get previous messages for context
        const previousUserMessage = conversationHistory
          .filter(m => m.role === 'user')
          .slice(-1)[0]
        const previousMessageText = previousUserMessage?.content as string | undefined
        
        const previousAssistantMessage = conversationHistory
          .filter(m => m.role === 'assistant')
          .slice(-1)[0]
        const previousAssistantContent = previousAssistantMessage?.content
        
        // Check if previous response was a note
        let previousWasNote = false
        let previousWasSameType = false
        if (previousAssistantContent) {
          try {
            const prevContent = typeof previousAssistantContent === 'string' 
              ? JSON.parse(previousAssistantContent) 
              : previousAssistantContent
            previousWasNote = prevContent?.type === 'note'
            previousWasSameType = prevContent?.type === aiResponse.type
          } catch (e) {
            // Ignore parse errors
          }
        }

        let isUpdate = false
        let groupIdToUse = currentGroupId

        // TOPIC-BASED UPDATE DETECTION
        if (currentTopic) {
          console.log('📝 Detected topic:', currentTopic);
          
          // Check if this topic already exists
          const existingTopics = Array.from(topicToGroupId.keys());
          const matchingTopic = findMatchingTopic(currentTopic, existingTopics);
          
          if (matchingTopic && topicToGroupId.has(matchingTopic)) {
            // Topic exists - determine if this is an update or new instance
            const isExplicitNew = lowerText.includes('new ') || 
                               lowerText.includes('another ') || 
                               lowerText.includes('different ') ||
                               lowerText.includes('separate ');
            
            const isLikelyUpdate = hasStrongUpdateKeywords || 
                                 (hasWeakUpdateKeywords && continuousMode) ||
                                 (continuousMode && previousWasSameType && !isExplicitNew);
            
            if (isLikelyUpdate) {
              // This is an update to an existing topic
              isUpdate = true;
              groupIdToUse = topicToGroupId.get(matchingTopic)!;
              console.log(`♻️ UPDATING existing topic "${matchingTopic}" with groupId:`, groupIdToUse);
              
              // Update the topic mapping to include the new phrasing
              if (currentTopic !== matchingTopic) {
                const newMap = new Map(topicToGroupId);
                newMap.set(currentTopic, groupIdToUse);
                setTopicToGroupId(newMap);
                console.log(`🔄 Added alternative topic name: "${currentTopic}" -> "${matchingTopic}"`);
              }
            } else {
              // Same topic but explicitly a new instance
              groupIdToUse = `group_${Date.now()}`;
              setCurrentGroupId(groupIdToUse);
              const newMap = new Map(topicToGroupId);
              newMap.set(currentTopic, groupIdToUse);
              setTopicToGroupId(newMap);
              console.log(`🆕 NEW instance of topic "${currentTopic}" with groupId:`, groupIdToUse);
            }
          } else {
            // Brand new topic
            groupIdToUse = `group_${Date.now()}`;
            setCurrentGroupId(groupIdToUse);
            const newMap = new Map(topicToGroupId);
            
            // Add both exact and normalized versions to help with future matching
            newMap.set(currentTopic, groupIdToUse);
            
            // Also add a version without common words for better matching
            const commonWords = ['the', 'and', 'for', 'with', 'about', 'from', 'that', 'this', 'these', 'those'];
            const normalizedTopic = currentTopic
              .split(' ')
              .filter(word => !commonWords.includes(word.toLowerCase()) && word.length > 0)
              .join(' ');
              
            if (normalizedTopic && normalizedTopic !== currentTopic) {
              newMap.set(normalizedTopic, groupIdToUse);
            }
            
            setTopicToGroupId(newMap);
            console.log(`🆕 NEW topic "${currentTopic}" with groupId:`, groupIdToUse);
          }
        } else {
          // No topic detected - fall back to old logic
          if (continuousMode && previousMessageText && previousWasSameType) {
            if (aiResponse.type === 'note') {
              const wantsNewNote =
                lowerText.includes('new checklist') ||
                lowerText.includes('new note') ||
                lowerText.includes('different checklist') ||
                lowerText.includes('another checklist') ||
                lowerText.includes('separate checklist') ||
                lowerText.includes('separate note') ||
                lowerText.includes('another note')

              isUpdate = !wantsNewNote
            } else {
              isUpdate = hasStrongUpdateKeywords || hasWeakUpdateKeywords
            }
          }

          if (!isUpdate) {
            groupIdToUse = `group_${Date.now()}`
            setCurrentGroupId(groupIdToUse)
            console.log(`🆕 NEW component (no topic) with groupId:`, groupIdToUse)
          } else {
            console.log(`♻️ UPDATING component (no topic) with groupId:`, groupIdToUse)
          }
        }

        console.log('🎯 Final decision:', { isUpdate, groupIdToUse, currentTopic })

        await handleAIResponse({
          ...aiResponse,
          groupId: groupIdToUse
        }, excalidrawAPI, conversationHistory, text, isUpdate)
      } catch (err) {
        console.error('handleAIResponse failed', err)
        setErrorMessage('Failed to render on canvas. Please try again.')
      }

    } catch (error) {
      console.error('Error processing voice:', error)
      if (!errorMessage) {
        const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred'
        setErrorMessage(errorMsg)
      }
    } finally {
      setIsProcessing(false)
      
      if (continuousMode && shouldAutoRestartRef.current) {
        setTimeout(() => {
          if (shouldAutoRestartRef.current) {
            startListening()
          }
        }, 800)
      }
    }
  }, [conversationHistory, continuousMode, currentGroupId, topicToGroupId, startListening, errorMessage])

  useEffect(() => {
    processTranscriptRef.current = processTranscript
  }, [processTranscript])

  const handleToggleListening = () => {
    if (isListening) {
      shouldAutoRestartRef.current = false
      stopListening()
      if (transcript.trim()) {
        void processTranscript(transcript)
      }
    } else {
      shouldAutoRestartRef.current = true
      setSessionTranscript('')
      startListening()
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault()
        if (!isProcessing && supported) {
          handleToggleListening()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleToggleListening, isProcessing, supported])

  const handleClearHistory = () => {
    setConversationHistory([])
    setCurrentGroupId(`group_${Date.now()}`)
    setTopicToGroupId(new Map())
    setErrorMessage(null)
    shouldAutoRestartRef.current = true
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current
      if (!state.isDragging) return
      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY
      setDragOffset({
        x: state.startOffsetX + dx,
        y: state.startOffsetY + dy,
      })
    }

    const handleMouseUp = () => {
      dragStateRef.current.isDragging = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleDragStart = (e: MouseEvent) => {
    e.preventDefault()
    dragStateRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: dragOffset.x,
      startOffsetY: dragOffset.y,
    }
  }

  return (
    <div
      className="fixed bottom-8 left-1/2 z-50"
      style={{ transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)` }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200/50 min-w-96 max-w-2xl backdrop-blur-sm">
        <div
          className="flex items-center justify-between p-4 cursor-move select-none border-b border-gray-100"
          onMouseDown={(e) => handleDragStart(e.nativeEvent)}
        >
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">Voice Assistant</h3>
            {conversationHistory.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                {conversationHistory.filter(m => m.role === 'user').length} messages
              </span>
            )}
            {topicToGroupId.size > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                {topicToGroupId.size} topics
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => {
                  setContinuousMode(e.target.checked)
                  if (e.target.checked && !isListening && !isProcessing) {
                    shouldAutoRestartRef.current = true
                    startListening()
                  }
                }}
                className="rounded"
              />
              <span>Continuous</span>
            </label>
            
            {conversationHistory.length > 0 && (
              <>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors duration-200"
                  title="Toggle conversation history"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                
                <button
                  onClick={handleClearHistory}
                  className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 transition-colors duration-200"
                  title="Clear conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            
            <button
              onClick={handleToggleListening}
              disabled={isProcessing || !supported}
              className={`
                p-2 rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95
                ${isListening 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg'
                }
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
                ${!supported ? 'opacity-40 cursor-not-allowed' : ''}
              `}
              title={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isListening ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {showHistory && conversationHistory.length > 0 && (
          <div className="max-h-60 overflow-y-auto border-b border-gray-100 bg-gray-50">
            {conversationHistory.filter(m => m.role === 'user').map((msg, idx) => (
              <div key={idx} className="p-3 border-b border-gray-200 last:border-b-0">
                <div className="text-xs text-gray-500 mb-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-sm text-gray-700">{msg.content}</div>
              </div>
            ))}
          </div>
        )}

        <div className="p-4 min-h-20">
          {!supported && (
            <div className="text-sm text-red-600 p-2 bg-red-50 rounded mb-2">
              ⚠️ Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.
            </div>
          )}

          {isListening && (
            <div className="flex items-center space-x-2 mb-2 animate-pulse">
              <div className="flex space-x-1">
                <div className="w-1.5 h-5 bg-blue-500 rounded-full animate-pulse"></div>
                <div className="w-1.5 h-5 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1.5 h-5 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-sm font-medium text-blue-600">
                {continuousMode ? 'Listening continuously... Speak naturally' : 'Listening...'}
              </span>
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center space-x-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm text-gray-600">Processing your request...</span>
            </div>
          )}

          {errorMessage && (
            <div className="text-sm text-red-700 p-2 bg-red-50 rounded mb-2">
              ⚠️ {errorMessage}
            </div>
          )}
          
          {(sessionTranscript || transcript) && (
            <div className="text-sm text-gray-700 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 mb-2 transition-all duration-200">
              <div className="text-xs font-medium text-blue-600 mb-1.5">You said:</div>
              <div className="text-gray-800 leading-relaxed">{sessionTranscript || transcript}</div>
            </div>
          )}
          
          {!transcript && !isListening && !isProcessing && (
            <div className="text-xs text-gray-500 text-center">
              {continuousMode 
                ? '🎤 Click the mic to start. I\'ll keep listening and connect your ideas together.'
                : '🎤 Click the mic to start speaking. Enable "Continuous" mode for seamless conversation.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}