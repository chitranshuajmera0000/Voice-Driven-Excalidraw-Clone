import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw'
import type { ExcalidrawElement, ExcalidrawAPIRef } from '../types/excalidraw'
import * as stringSimilarity from 'string-similarity'

interface AIResponse {
  // 'multi' allows returning both notes and diagrams in a single response
  // with content being an array of nested AIResponse-like objects
  type: 'note' | 'diagram' | 'multi'
  content: string | string[] | AIResponse[] | any
  // Optional short heading describing the note or diagram
  title?: string
  groupId?: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | any
  timestamp: number
}

// Helper: generate stable unique ids
function makeId(prefix = 'el') {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

// Helper: extract text from label (handles strings, objects, arrays)
function extractLabelText(label: any): string {
  if (!label) return ''
  if (typeof label === 'string') return label
  if (typeof label === 'number') return String(label)
  if (Array.isArray(label)) {
    // If it's an array, try to extract text from each item
    return label.map(item => extractLabelText(item)).filter(Boolean).join(' ')
  }
  if (typeof label === 'object') {
    // Try common properties that might contain the text
    return label.text || label.rawText || label.value || label.label || label.content || label.name || label.title || JSON.stringify(label)
  }
  return String(label)
}

// Helper: Extract and normalize flowchart content for comparison
function extractFlowchartContent(content: string | string[]): string {
  const contentStr = Array.isArray(content) ? content.join('\n') : content;
  
  // Normalize whitespace and remove comments
  return contentStr
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
    .replace(/\/\/.*$/gm, '')            // Remove // comments
    .replace(/\s+/g, ' ')                // Normalize whitespace
    .replace(/[^\w\s]/g, '')            // Remove special characters
    .trim()
    .toLowerCase();
}

// Helper: Extract and normalize note content for comparison
function extractNoteContent(content: string | string[]): string {
  const contentStr = Array.isArray(content) ? content.join(' ') : content;
  
  // Normalize and clean the content for better comparison
  return contentStr
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove special characters
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();
}

// Helper: Find similar existing note by content
function findSimilarNote(
  content: string | string[],
  existingElements: ExcalidrawElement[],
  threshold: number = 0.7
): { groupId: string; isExactMatch: boolean } | null {
  const normalizedContent = extractNoteContent(content);
  
  // Get all existing notes (elements with noteElement = true)
  const existingNotes = new Map<string, { content: string; title: string }>();
  
  // First pass: collect all note content and titles
  existingElements.forEach(el => {
    if ((el as any).noteElement === true && el.groupIds && el.groupIds.length > 0) {
      const groupId = el.groupIds[el.groupIds.length - 1];
      if (!groupId.startsWith('group_')) return;
      
      const noteData = existingNotes.get(groupId) || { content: '', title: '' };
      
      // For text elements that are part of notes
      if (el.type === 'text' && el.text) {
        // Check if this is a title (first text element in the note)
        if (!noteData.content && !noteData.title) {
          noteData.title = el.text;
        } else {
          noteData.content += ' ' + el.text;
        }
      }
      // For rectangle elements that are part of notes
      else if (el.type === 'rectangle' && (el as any).label) {
        noteData.content += ' ' + (el as any).label;
      }
      
      existingNotes.set(groupId, noteData);
    }
  });
  
  // If we have a single note with a matching title, use that
  const contentStr = Array.isArray(content) ? content.join(' ') : content;
  const potentialTitle = contentStr.split('\n')[0]?.trim();
  
  for (const [groupId, noteData] of existingNotes.entries()) {
    // Check for exact title match first
    if (noteData.title && potentialTitle && 
        noteData.title.toLowerCase() === potentialTitle.toLowerCase()) {
      return { groupId, isExactMatch: true };
    }
  }
  
  // If no exact title match, find the most similar note by content
  let bestMatch: { groupId: string; similarity: number } | null = null;
  
  for (const [groupId, noteData] of existingNotes.entries()) {
    const fullNoteContent = (noteData.title + ' ' + noteData.content).trim();
    if (!fullNoteContent) continue;
    
    const similarity = stringSimilarity.compareTwoStrings(
      normalizedContent,
      extractNoteContent(fullNoteContent)
    );
    
    // If we find an exact match, return immediately
    if (similarity >= 0.95) {
      return { groupId, isExactMatch: true };
    }
    
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { groupId, similarity };
    }
  }
  
  return bestMatch ? { groupId: bestMatch.groupId, isExactMatch: false } : null;
}

// Helper: Find similar existing flowchart by content
function findSimilarFlowchart(
  content: string,
  existingElements: ExcalidrawElement[],
  threshold: number = 0.7
): string | null {
  const normalizedContent = extractFlowchartContent(content);
  
  // Get all existing flowcharts (elements with type 'arrow' or 'rectangle' that are part of a diagram)
  const existingFlowcharts = new Map<string, string>(); // groupId -> content
  
  // First pass: collect all text content from existing diagrams
  existingElements.forEach(el => {
    if (el.groupIds && el.groupIds.length > 0 && (el.type === 'text' || el.type === 'rectangle' || el.type === 'arrow')) {
      const groupId = el.groupIds[el.groupIds.length - 1];
      if (!groupId.startsWith('group_')) return;
      
      let currentContent = existingFlowcharts.get(groupId) || '';
      
      if (el.type === 'text' && el.text) {
        currentContent += ' ' + el.text;
      } else if (el.type === 'rectangle' && (el as any).label) {
        currentContent += ' ' + (el as any).label;
      }
      
      existingFlowcharts.set(groupId, currentContent);
    }
  });
  
  // Find the most similar existing flowchart
  let bestMatch: { groupId: string; similarity: number } | null = null;
  
  // Convert Map to array for iteration
  Array.from(existingFlowcharts.entries()).forEach(([groupId, existingContent]) => {
    if (!existingContent.trim()) return;
    
    const similarity = stringSimilarity.compareTwoStrings(
      normalizedContent,
      extractFlowchartContent(existingContent)
    );
    
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { groupId, similarity };
    }
  });
  
  return bestMatch?.groupId || null;
}

// Factory for a valid Excalidraw text element (fill required fields)
function createTextElement(opts: {
  x: number
  y: number
  text: string | number | any
  width?: number
  height?: number
  fontSize?: number
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  containerId?: string | null
}) {
  const now = Date.now()
  const fontSize = opts.fontSize ?? 20 // Medium font size for better visibility
  
  // Ensure text is always a string
  const text = typeof opts.text === 'string' ? opts.text : (opts.text != null ? String(opts.text) : 'Empty text')
  
  // Calculate approximate dimensions based on text
  const lines = text.split('\n')
  const maxLineLength = Math.max(...lines.map(l => l.length), 1)
  const estimatedWidth = Math.max(opts.width ?? 200, maxLineLength * fontSize * 0.6 + 20)
  const estimatedHeight = Math.max(opts.height ?? 40, lines.length * fontSize * 1.35 + 10)

  const textElement = {
    id: makeId('text'),
    type: 'text',
    x: opts.x,
    y: opts.y,
    width: opts.width ?? estimatedWidth,
    height: opts.height ?? estimatedHeight,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 100000),
    version: 3, // Start at version 3 to ensure proper initial render
    versionNonce: Math.floor(Math.random() * 1e9),
    isDeleted: false,
    groupIds: [],
    boundElements: [],
    frameId: null,
    roundness: null,
    link: null,
    locked: false,
    text: text,
    fontSize: fontSize,
    fontFamily: 1, // Excalidraw (handwritten)
    textAlign: opts.textAlign ?? 'center',
    verticalAlign: opts.verticalAlign ?? 'middle',
    containerId: opts.containerId ?? null,
    originalText: text,
    lineHeight: 1.25,
    baseline: fontSize, // CRITICAL: This property is needed for text to render
    updated: now,
    autoResize: opts.containerId ? false : true, // Enable autoResize for standalone text
  } as any as ExcalidrawElement

  return textElement
}

function createRectangleElement(opts: {
  x: number
  y: number
  width: number
  height: number
  strokeColor?: string
  backgroundColor?: string
  roundness?: number | { type: number }
}) {
  const now = Date.now()
  return {
    id: makeId('rect'),
    type: 'rectangle',
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    angle: 0,
    strokeColor: opts.strokeColor ?? '#2563eb',
    backgroundColor: opts.backgroundColor ?? '#eff6ff',
    fillStyle: 'solid',
    strokeWidth: 2.5,
    strokeStyle: 'solid',
    roughness: 1.5,
    opacity: 100,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    isDeleted: false,
    groupIds: [],
    boundElements: [],
    frameId: null,
    roundness: opts.roundness ?? { type: 3 },
    link: null,
    locked: false,
    updated: now,
  } as any as ExcalidrawElement
}

// Calculate bounding box of all elements
function calculateBounds(elements: ExcalidrawElement[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  centerX: number
  centerY: number
} {
  if (elements.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    }
  }

  const bounds = elements.reduce(
    (acc, el) => {
      const right = (el.x || 0) + (el.width || 0)
      const bottom = (el.y || 0) + (el.height || 0)
      return {
        minX: Math.min(acc.minX, el.x || 0),
        minY: Math.min(acc.minY, el.y || 0),
        maxX: Math.max(acc.maxX, right),
        maxY: Math.max(acc.maxY, bottom),
      }
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  )

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const centerX = bounds.minX + width / 2
  const centerY = bounds.minY + height / 2

  return { ...bounds, width, height, centerX, centerY }
}

// Check if a rectangle overlaps with any existing element
function hasCollision(
  x: number,
  y: number,
  width: number,
  height: number,
  existingElements: ExcalidrawElement[],
  padding: number = 50
): boolean {
  const testRight = x + width + padding
  const testBottom = y + height + padding
  const testLeft = x - padding
  const testTop = y - padding

  return existingElements.some((el) => {
    const elRight = (el.x || 0) + (el.width || 0)
    const elBottom = (el.y || 0) + (el.height || 0)
    const elLeft = el.x || 0
    const elTop = el.y || 0

    // Check for overlap
    return !(
      testRight < elLeft ||
      testLeft > elRight ||
      testBottom < elTop ||
      testTop > elBottom
    )
  })
}

// Calculate smart positioning based on existing elements
function calculateSmartPosition(
  existingElements: ExcalidrawElement[],
  elementType: 'note' | 'diagram',
  groupId?: string,
  estimatedWidth?: number,
  estimatedHeight?: number
): { x: number; y: number } {
  // Default viewport center (typical Excalidraw viewport)
  // These values work well for most screen sizes
  const viewportCenterX = 600
  const viewportCenterY = 400
  const spacing = 200 // Spacing between elements
  const minMargin = 100 // Minimum margin from viewport edges

  // If we have a groupId, try to find related elements
  if (groupId && existingElements.length > 0) {
    const relatedElements = existingElements.filter(
      (el: any) => el.groupIds?.includes(groupId) || el.id?.includes(groupId)
    )

    if (relatedElements.length > 0) {
      const bounds = calculateBounds(relatedElements)
      // For diagrams, position below the group
      if (elementType === 'diagram') {
        return {
          x: bounds.centerX - (estimatedWidth || 400) / 2,
          y: bounds.maxY + spacing,
        }
      } else {
        // For notes, position to the right
        return {
          x: bounds.maxX + spacing,
          y: bounds.minY,
        }
      }
    }
  }

  // If no existing elements, center on viewport
  if (existingElements.length === 0) {
    const width = estimatedWidth || 400
    const height = estimatedHeight || 300

    // For diagrams, center them nicely
    if (elementType === 'diagram') {
      return {
        x: viewportCenterX - width / 2,
        y: viewportCenterY - height / 2,
      }
    } else {
      // For notes, position slightly to the left of center
      return {
        x: viewportCenterX - width / 2 - 100,
        y: viewportCenterY - height / 2,
      }
    }
  }

  // Calculate bounds of all existing elements
  const allBounds = calculateBounds(existingElements)

  // For diagrams, try to center them in available space
  if (elementType === 'diagram') {
    const width = estimatedWidth || 400
    const height = estimatedHeight || 300

    // Try to center below existing content
    let candidateY = allBounds.maxY + spacing
    let candidateX = allBounds.centerX - width / 2

    // Ensure it doesn't go too far left
    candidateX = Math.max(100, candidateX)

    // Check for collisions and adjust if needed
    if (
      hasCollision(candidateX, candidateY, width, height, existingElements)
    ) {
      // Try to the right
      candidateX = allBounds.maxX + spacing
      candidateY = allBounds.minY

      // If still colliding, try below and to the right
      if (
        hasCollision(candidateX, candidateY, width, height, existingElements)
      ) {
        candidateY = allBounds.maxY + spacing
        candidateX = allBounds.centerX - width / 2
      }
    }

    // Ensure we don't go too far left
    candidateX = Math.max(minMargin, candidateX)
    candidateY = Math.max(minMargin, candidateY)

    return { x: candidateX, y: candidateY }
  } else {
    // For notes, position to the right of existing content
    let candidateX = allBounds.maxX + spacing
    let candidateY = allBounds.minY
    const width = estimatedWidth || 300
    const height = estimatedHeight || 150

    // Check for collisions
    if (hasCollision(candidateX, candidateY, width, height, existingElements)) {
      // Try below
      candidateY = allBounds.maxY + spacing
      candidateX = allBounds.minX

      // If still colliding, try a new column
      if (hasCollision(candidateX, candidateY, width, height, existingElements)) {
        candidateX = allBounds.maxX + spacing * 2
        candidateY = viewportCenterY

        // Last resort: position at viewport center
        if (hasCollision(candidateX, candidateY, width, height, existingElements)) {
          candidateX = viewportCenterX - width / 2
          candidateY = allBounds.maxY + spacing
        }
      }
    }

    // Ensure we don't go too far left
    candidateX = Math.max(minMargin, candidateX)
    candidateY = Math.max(minMargin, candidateY)

    return { x: candidateX, y: candidateY }
  }
}

// Detect if a message is updating/replacing the previous note
function isUpdateMessage(transcript: string, previousMessage?: string): boolean {
  if (!previousMessage) return false

  const lowerTranscript = transcript.toLowerCase()
  const updateKeywords = [
    'wait',
    'before we finalize',
    'also add',
    'add to',
    'update',
    'replace',
    'change',
    'modify',
    'instead',
    'let\'s replace',
    'we must also add',
    'before finalizing',
    'oh wait',
    'actually',
    'also include',
    'add requirement'
  ]

  return updateKeywords.some(keyword => lowerTranscript.includes(keyword))
}

// Find the last note element with the given groupId
function findLastNoteWithGroupId(elements: ExcalidrawElement[], groupId: string): {
  textElement: ExcalidrawElement | null
  rectElement: ExcalidrawElement | null
} {
  let lastTextElement: ExcalidrawElement | null = null
  let lastRectElement: ExcalidrawElement | null = null
  let lastTimestamp = 0

  elements.forEach((el: any) => {
    // Only consider elements that are explicitly marked as part of a note
    const isNoteElement = (el as any).noteElement === true
    if (isNoteElement && el.groupIds && Array.isArray(el.groupIds) && el.groupIds.includes(groupId)) {
      if (el.type === 'text' && el.updated && el.updated > lastTimestamp) {
        lastTextElement = el
        lastTimestamp = el.updated
      } else if (el.type === 'rectangle' && el.updated && el.updated > lastTimestamp) {
        lastRectElement = el
      }
    }
  })

  return { textElement: lastTextElement, rectElement: lastRectElement }
}

export async function handleAIResponse(
  response: AIResponse,
  excalidrawAPI: ExcalidrawAPIRef,
  conversationHistory: ConversationMessage[] = [],
  transcript?: string,
  shouldUpdate?: boolean
): Promise<void> {
  console.log('handleAIResponse called with:', { response, excalidrawAPI: !!excalidrawAPI, shouldUpdate })

  if (!excalidrawAPI) {
    console.error('Excalidraw API not available')
    return
  }

  // Defensive guard: ensure expected API methods exist
  if (typeof excalidrawAPI.getSceneElements !== 'function' || typeof excalidrawAPI.updateScene !== 'function') {
    console.error('Excalidraw API missing expected methods')
    return
  }

  const existingElements = excalidrawAPI.getSceneElements() || []

  // Handle compound responses that contain multiple sub-responses
  if (response.type === 'multi') {
    const items = Array.isArray(response.content) ? response.content : []

    // Ensure we have a stable parent group id for this multi-response
    const parentGroupId = response.groupId || makeId('group')

    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      if (!item || typeof item !== 'object') continue
      if (!('type' in item) || !('content' in item)) continue

      // Give each sub-item its own child group id so updates can target them
      const childGroupId = (item as any).groupId ?? `${parentGroupId}_${index}`
      const nested: AIResponse = {
        ...(item as any),
        groupId: childGroupId,
      }

      // Recursively render each sub-response
      await handleAIResponse(
        nested,
        excalidrawAPI,
        conversationHistory,
        transcript,
        shouldUpdate
      )
    }
    return
  }

  if (response.type === 'note') {
    let contentText = Array.isArray(response.content)
      ? response.content.map((line) => {
          // Ensure each line starts with bullet point
          const trimmed = String(line).trim()
          return trimmed.startsWith('•') ? trimmed : `• ${trimmed}`
        }).join('\n')
      : response.content
      
    // Check if we should update an existing note instead of creating a new one
    if (!shouldUpdate && !response.groupId) {
      const similarNote = findSimilarNote(contentText, existingElements);
      if (similarNote) {
        console.log(`Found similar note with groupId: ${similarNote.groupId}, updating instead of creating new`);
        response.groupId = similarNote.groupId;
        shouldUpdate = true;
      }
    }

    // Ensure content has bullet points - if it doesn't start with •, add them
    if (typeof contentText === 'string' && contentText.trim()) {
      const lines = contentText.split('\n')
      const hasBullets = lines.some(line => line.trim().startsWith('•'))

      if (!hasBullets) {
        // Add bullet points to each non-empty line
        contentText = lines
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => line.startsWith('•') ? line : `• ${line}`)
          .join('\n')
      } else {
        // Ensure all lines have bullets
        contentText = lines
          .map(line => {
            const trimmed = line.trim()
            if (!trimmed) return ''
            return trimmed.startsWith('•') ? trimmed : `• ${trimmed}`
          })
          .filter(line => line.length > 0)
          .join('\n')
      }
    }

    const groupIds = response.groupId ? [response.groupId] : []

    // When updating, always delete existing note elements for this group and
    // recreate the note from scratch. This is simpler and more robust than
    // mutating the previous text element in place.
    const shouldUpdateNote = shouldUpdate && response.groupId

    if (shouldUpdateNote && response.groupId) {
      console.log('Refreshing note for groupId', response.groupId)
      const filteredElements = existingElements.filter((el: any) => {
        const isSameGroup = el.groupIds && Array.isArray(el.groupIds) && el.groupIds.includes(response.groupId!)
        const isNoteElement = (el as any).noteElement === true
        // Keep everything that is not a note in this group
        return !(isSameGroup && isNoteElement)
      })

      // CRITICAL: Force immediate scene update to clear old elements before creating new ones
      excalidrawAPI.updateScene({
        elements: filteredElements,
        appState: {},
        storeAction: 'capture'
      })
      
      // Wait for Excalidraw to process the deletion
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Create new note (either new topic or after clearing old one)
    // Calculate dimensions for the text content
    const lines = contentText.split('\n')
    const maxLineLength = Math.max(...lines.map(l => l.length), 1)
    
    // Calculate text dimensions - let it be generous to avoid clipping
    const textWidth = Math.max(400, maxLineLength * 11)
    const textHeight = Math.max(80, lines.length * 28)
    
    // Rectangle should be larger to accommodate padding
    const textPaddingX = 20
    const textPaddingY = 15
    const rectWidth = textWidth + (textPaddingX * 2)
    const rectHeight = textHeight + (textPaddingY * 2)

    // Get current elements AFTER potential deletion
    const currentElements = excalidrawAPI.getSceneElements() || []

    // Calculate position with estimated dimensions
    const position = calculateSmartPosition(
      currentElements,
      response.type,
      response.groupId,
      rectWidth,
      rectHeight
    )

    // Create the rectangle FIRST
    const rect = createRectangleElement({
      x: position.x,
      y: position.y,
      width: rectWidth,
      height: rectHeight,
      strokeColor: '#3b82f6',
      backgroundColor: '#eff6ff',
      roundness: { type: 3 },
    })
    rect.groupIds = groupIds
    ;(rect as any).noteElement = true

    // Create text element - DON'T set explicit width/height, let Excalidraw calculate it
    // This prevents text clipping issues
    const textElement = createTextElement({
      x: rect.x + textPaddingX,
      y: rect.y + textPaddingY,
      text: contentText,
      // DON'T set width/height - let Excalidraw auto-size based on content
      fontSize: 20,
      textAlign: 'left',
      verticalAlign: 'top',
    })

    // Add groupId to elements for grouping
    textElement.groupIds = groupIds
    ;(textElement as any).noteElement = true

    // Optional heading above the note for better readability
    let headingElement: ExcalidrawElement | null = null
    if (response.title && typeof response.title === 'string' && response.title.trim()) {
      headingElement = createTextElement({
        x: rect.x,
        y: rect.y - 50,
        text: response.title.trim(),
        width: rect.width,
        height: 40,
        fontSize: 24,
        textAlign: 'center',
        verticalAlign: 'middle',
      })
      headingElement.groupIds = groupIds
      ;(headingElement as any).noteElement = true
    }

    // Add text above rectangle visually (rectangle first so it's behind)
    const newElements = headingElement
      ? [...currentElements, rect, headingElement, textElement]
      : [...currentElements, rect, textElement]

    console.log('Updating scene with new elements:', newElements.length)
    
    // First update - add the elements
    excalidrawAPI.updateScene({
      elements: newElements,
      appState: {},
      storeAction: 'capture'
    })
    
    // CRITICAL: Use requestAnimationFrame to ensure Excalidraw processes the first update
    // before we force the re-render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentSceneElements = excalidrawAPI.getSceneElements() || []
        const forceRenderElements = currentSceneElements.map((el: any) => {
          // Only update text elements that were just added
          if (el.type === 'text' && (el.id === textElement.id || (headingElement && el.id === headingElement.id))) {
            return {
              ...el,
              version: el.version + 2,
              versionNonce: Math.floor(Math.random() * 1e9),
              updated: Date.now(),
              baseline: el.fontSize || 20,
            }
          }
          return el
        })
        
        excalidrawAPI.updateScene({
          elements: forceRenderElements,
          appState: {},
          storeAction: 'capture'
        })
      })
    })
    
    console.log('Note elements added to scene')
  } else if (response.type === 'diagram') {
    try {
      const diagramContent = Array.isArray(response.content)
        ? response.content.join('\n')
        : response.content

      console.log('Attempting to parse Mermaid diagram:', diagramContent.substring(0, 200))
      
      // Check if we should update an existing flowchart instead of creating a new one
      if (!shouldUpdate && !response.groupId) {
        const similarFlowchartId = findSimilarFlowchart(diagramContent, existingElements);
        if (similarFlowchartId) {
          console.log(`Found similar flowchart with groupId: ${similarFlowchartId}, updating instead of creating new`);
          response.groupId = similarFlowchartId;
          shouldUpdate = true;
        }
      }

      // Parse Mermaid diagram to Excalidraw elements
      let parsed
      try {
        parsed = await parseMermaidToExcalidraw(diagramContent)
      } catch (parseError) {
        console.error('Mermaid parse error:', parseError)
        
        // Try to clean up common issues in Mermaid syntax
        let cleanedContent = diagramContent
        
        // Fix 1: Remove parentheses from node labels (common cause of "got 'PS'" error)
        cleanedContent = cleanedContent.replace(/\[([^\]]*)\(([^\)]*)\)([^\]]*)\]/g, '[$1 - $2 - $3]')
        
        // Fix 2: Escape special characters in labels
        cleanedContent = cleanedContent.replace(/\[([^\]]*["'])/g, (match, group) => {
          return '[' + group.replace(/["']/g, '')
        })
        
        // Fix 3: Remove any invalid characters that might cause parsing issues
        cleanedContent = cleanedContent.replace(/[^\x20-\x7E\n]/g, '')
        
        console.log('Retrying with cleaned content:', cleanedContent.substring(0, 200))
        
        try {
          parsed = await parseMermaidToExcalidraw(cleanedContent)
        } catch (secondError) {
          console.error('Second parse attempt failed:', secondError)
          
          // If still failing, create a simple error note instead
          throw new Error(`Unable to parse diagram. Mermaid syntax error: ${parseError.message || parseError}`)
        }
      }

      if (!parsed || !Array.isArray(parsed.elements)) {
        throw new Error('Failed to parse Mermaid diagram - no elements returned')
      }

      const elements = parsed.elements as any[]

      if (elements.length === 0) {
        throw new Error('No elements generated from Mermaid diagram')
      }

      console.log('Successfully parsed diagram with', elements.length, 'elements')

      // Normalize parsed elements: ensure required properties and unique ids
      const groupIds = response.groupId ? [response.groupId] : []

      // Calculate bounding box of new diagram elements to position them smartly
      const diagramBounds = elements.reduce((acc, el) => {
        const right = (el.x || 0) + (el.width || 0)
        const bottom = (el.y || 0) + (el.height || 0)
        return {
          minX: Math.min(acc.minX, el.x || 0),
          minY: Math.min(acc.minY, el.y || 0),
          maxX: Math.max(acc.maxX, right),
          maxY: Math.max(acc.maxY, bottom),
        }
      }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })

      const diagramWidth = diagramBounds.maxX - diagramBounds.minX
      const diagramHeight = diagramBounds.maxY - diagramBounds.minY

      // If this is an update, remove any previous DIAGRAM elements for this groupId
      let baseElements = existingElements
      if (shouldUpdate && response.groupId) {
        const filtered = existingElements.filter((el: any) => {
          const isSameGroup = el.groupIds && Array.isArray(el.groupIds) && el.groupIds.includes(response.groupId!)
          const isNoteElement = (el as any).noteElement === true
          // Remove only non-note elements in this group (i.e., prior diagram elements),
          // keep the note elements so checklist updates are preserved.
          return !(isSameGroup && !isNoteElement)
        })
        
        // If we're updating an existing diagram, make sure we have the latest elements
        if (filtered.length !== existingElements.length) {
          console.log(`Removing ${existingElements.length - filtered.length} old diagram elements for update`);
        }

        if (filtered.length !== existingElements.length) {
          console.log('Updating existing diagram: removing previous elements for groupId', response.groupId)
          excalidrawAPI.updateScene({
            elements: filtered,
            appState: {},
            storeAction: 'capture'
          })
          
          // Wait for Excalidraw to process the deletion
          await new Promise(resolve => setTimeout(resolve, 100))
          
          baseElements = excalidrawAPI.getSceneElements() || []
        }
      }

      // Calculate position using improved positioning logic
      const position = calculateSmartPosition(
        baseElements,
        response.type,
        response.groupId,
        diagramWidth,
        diagramHeight
      )

      // Calculate offset to position diagram smartly with better spacing
      // Center the diagram at the calculated position
      const offsetX = position.x - diagramBounds.minX
      const offsetY = position.y - diagramBounds.minY

      // First pass: normalize all elements and create ID mapping
      const idMap = new Map()
      const normalized = elements.map((el: any, idx: number) => {
        const oldId = el.id ?? makeId('m')
        const newId = `${oldId}_${Date.now()}_${idx}`
        idMap.set(oldId, newId)

        // Ensure all required properties are present
        const normalizedEl: any = {
          ...el,
          id: newId,
          x: (el.x ?? 0) + offsetX,
          y: (el.y ?? 0) + offsetY,
          width: el.width ?? 100,
          height: el.height ?? 100,
          angle: el.angle ?? 0,
          seed: el.seed ?? Math.floor(Math.random() * 100000),
          version: el.version ?? 1,
          versionNonce: el.versionNonce ?? Math.floor(Math.random() * 1e9),
          isDeleted: false,
          groupIds: Array.isArray(el.groupIds) ? [...el.groupIds, ...groupIds] : groupIds,
          updated: Date.now(),
          // Ensure arrays are always arrays, not undefined
          boundElements: Array.isArray(el.boundElements) ? el.boundElements : [],
          // Only include points if it's an array and the element type requires it
          ...(Array.isArray(el.points) && el.points.length > 0 ? { points: el.points } : {}),
          // Ensure roundness is properly structured - add rounded edges for rectangles and diamonds
          roundness: el.roundness ?? (el.type === 'rectangle' || el.type === 'diamond' ? { type: 3 } : null),
          // Ensure fill properties with better defaults
          fillStyle: el.fillStyle ?? 'solid',
          backgroundColor: el.backgroundColor ?? (el.type === 'rectangle' || el.type === 'diamond' ? '#eff6ff' : 'transparent'),
          strokeColor: el.strokeColor ?? (el.type === 'arrow' || el.type === 'line' ? '#1e1e1e' : '#2563eb'),
          strokeWidth: el.strokeWidth ?? (el.type === 'arrow' || el.type === 'line' ? 2 : 2.5),
          strokeStyle: el.strokeStyle ?? 'solid',
          opacity: el.opacity ?? 100,
          roughness: el.roughness ?? (el.type === 'text' ? 0 : 1.5),
          locked: el.locked ?? false,
          frameId: el.frameId ?? null,
          link: el.link ?? null,
        }

        // Preserve text properties for text elements (don't overwrite if they exist)
        if (el.type === 'text' || el.text || el.label) {
          normalizedEl.type = el.type === 'text' ? 'text' : normalizedEl.type
          if (el.text || el.label) {
            // Extract text properly from label objects
            const textValue = el.text ? extractLabelText(el.text) : extractLabelText(el.label)
            normalizedEl.text = textValue || ''
            const originalValue = el.originalText ? extractLabelText(el.originalText) : textValue
            normalizedEl.originalText = originalValue || textValue || ''
          }

          // Set better defaults for text elements with medium font size
          // FORCE center alignment for all text in shapes - override any existing alignment
          if (el.fontSize === undefined) normalizedEl.fontSize = 20 // Medium font size for better visibility
          if (el.fontFamily === undefined) normalizedEl.fontFamily = 1
          normalizedEl.textAlign = 'center' // ALWAYS center text in shapes - force override
          normalizedEl.verticalAlign = 'middle' // ALWAYS middle align text in shapes - force override
          if (el.containerId !== undefined) normalizedEl.containerId = el.containerId
          if (el.lineHeight === undefined) normalizedEl.lineHeight = 1.25
          
          // CRITICAL: Set baseline property for text to render properly
          normalizedEl.baseline = normalizedEl.fontSize
          
          // Ensure autoResize is set properly
          normalizedEl.autoResize = normalizedEl.containerId ? false : true
          
          // Force version to 3+ to ensure re-render
          normalizedEl.version = Math.max((el.version ?? 1) + 1, 3)
        } else if (normalizedEl.type === 'rectangle' || normalizedEl.type === 'diamond' || normalizedEl.type === 'ellipse') {
          // For shapes that might have text bound to them, ensure we'll center it later
          // This is handled in the text element creation section below
        }

        // Preserve containerId for text elements bound to shapes
        if (el.containerId) {
          normalizedEl.containerId = idMap.get(el.containerId) ?? el.containerId
        }

        // Remove undefined properties that might cause issues
        Object.keys(normalizedEl).forEach(key => {
          if (normalizedEl[key] === undefined) {
            delete normalizedEl[key]
          }
        })

        return normalizedEl as ExcalidrawElement
      })

      // Second pass: update boundElements references with new IDs
      normalized.forEach((el: any) => {
        if (Array.isArray(el.boundElements) && el.boundElements.length > 0) {
          el.boundElements = el.boundElements.map((bound: any) => {
            if (bound.id && idMap.has(bound.id)) {
              return { ...bound, id: idMap.get(bound.id) }
            }
            return bound
          })
        }
      })

      // Log elements for debugging
      console.log('Normalized elements:', normalized.map((el: any) => ({
        id: el.id,
        type: el.type,
        text: el.text,
        label: el.label,
        containerId: el.containerId,
        boundElements: el.boundElements
      })))

      // Also log raw elements to see structure
      console.log('Raw elements sample:', elements.slice(0, 2).map((el: any) => ({
        type: el.type,
        label: el.label,
        text: el.text,
        boundElements: el.boundElements
      })))

      // Separate text elements from shape elements
      const textElements = normalized.filter((el: any) => el.type === 'text')
      const shapeElements = normalized.filter((el: any) => el.type !== 'text')

      // Create a map of containerId to text element for quick lookup
      // Also ensure existing text elements are properly centered
      const textByContainer = new Map()
      textElements.forEach((textEl: any) => {
        if (textEl.containerId) {
          // Find the container shape
          const container = shapeElements.find((s: any) => s.id === textEl.containerId)
          if (container) {
            // Update text element to match container dimensions for perfect centering
            textEl.x = container.x
            textEl.y = container.y
            textEl.width = container.width || 100
            textEl.height = container.height || 100
            
            // FORCE center alignment - override any existing alignment
            textEl.textAlign = 'center'
            textEl.verticalAlign = 'middle'
            
            // Ensure these properties are set for proper rendering
            textEl.autoResize = false
            if (!textEl.originalText) {
              textEl.originalText = textEl.text || ''
            }
            
            // Ensure lineHeight is set for proper vertical spacing
            if (!textEl.lineHeight) {
              textEl.lineHeight = 1.25
            }
            
            // CRITICAL: Set baseline for proper text rendering
            textEl.baseline = textEl.fontSize || 20
            
            // Force update to ensure proper rendering with higher version number
            textEl.updated = Date.now()
            textEl.version = Math.max((textEl.version || 1) + 1, 3)
            textEl.versionNonce = Math.floor(Math.random() * 1e9)
          }
          textByContainer.set(textEl.containerId, textEl)
        }
      })

      // Create text elements for shapes that have labels but no bound text
      const elementsWithText: any[] = [...textElements] // Start with existing text elements
      shapeElements.forEach((el: any) => {
        elementsWithText.push(el)

        // Check if this shape already has a bound text element
        const hasBoundText = el.boundElements && el.boundElements.length > 0
        const hasTextElement = textByContainer.has(el.id)

        // If element has a label but no text element bound, create one
        if (el.label && !hasBoundText && !hasTextElement) {
          // Extract text from label (handles objects, arrays, strings)
          const labelText = extractLabelText(el.label)

          if (labelText && labelText !== '[object Object]' && labelText.trim()) {
            // Use the container's exact dimensions for perfect centering
            const fontSize = 20 // Medium font size for better visibility
            const containerWidth = el.width || 100
            const containerHeight = el.height || 100

            // Position text at the exact center of the container
            // The text element should match the container dimensions for proper centering
            const textX = el.x
            const textY = el.y

            const textElement = createTextElement({
              x: textX,
              y: textY,
              text: labelText,
              fontSize: fontSize,
              width: containerWidth, // Match container width for perfect centering
              height: containerHeight, // Match container height for perfect centering
              textAlign: 'center',
              verticalAlign: 'middle',
              containerId: el.id, // This tells Excalidraw to center it automatically
            })

            // Ensure text element has all properties needed for proper centering
            // Excalidraw sometimes needs these explicitly set
            textElement.autoResize = false
            textElement.originalText = labelText
            
            // FORCE center alignment - override any defaults
            textElement.textAlign = 'center'
            textElement.verticalAlign = 'middle'
            
            // Ensure lineHeight is set
            if (!textElement.lineHeight) {
              textElement.lineHeight = 1.25
            }
            
            // Ensure fontFamily is set
            if (!textElement.fontFamily) {
              textElement.fontFamily = 1
            }
            
            // CRITICAL: Set baseline for proper text rendering
            textElement.baseline = fontSize
            
            // Force update to ensure proper rendering with higher version
            textElement.updated = Date.now()
            // Ensure version starts at 3 for immediate render
            textElement.version = 3
            textElement.versionNonce = Math.floor(Math.random() * 1e9)

            // Bind text to the shape
            textElement.groupIds = el.groupIds || []

            // Add text to shape's boundElements
            if (!el.boundElements) {
              el.boundElements = []
            }
            el.boundElements.push({
              type: 'text',
              id: textElement.id
            })

            elementsWithText.push(textElement)
          }
        }
      })

      // Filter out any invalid elements before updating
      const validElements = elementsWithText.filter((el: any) => {
        // Ensure element has required properties
        // Text elements might have different requirements
        if (el.type === 'text') {
          return el && el.id && typeof el.x === 'number' && typeof el.y === 'number' &&
            typeof el.width === 'number' && typeof el.height === 'number' && el.text !== undefined
        }
        return el && el.id && typeof el.x === 'number' && typeof el.y === 'number' &&
          typeof el.width === 'number' && typeof el.height === 'number' && el.type
      })

      console.log('Updating scene with diagram elements:', validElements.length)
      console.log('Text elements:', validElements.filter((el: any) => el.type === 'text').length)

      // Optional heading above the diagram for better readability
      if (response.title && typeof response.title === 'string' && response.title.trim()) {
        const heading = createTextElement({
          x: position.x,
          y: position.y - 60,
          text: response.title.trim(),
          width: diagramWidth,
          height: 40,
          fontSize: 24,
          textAlign: 'center',
          verticalAlign: 'middle',
        })
        heading.groupIds = groupIds
        validElements.push(heading)
      }

      if (validElements.length === 0) {
        throw new Error('No valid elements to add to scene')
      }

      // First update - add all elements
      const allElements = [...baseElements, ...validElements]
      excalidrawAPI.updateScene({
        elements: allElements,
        appState: {},
        storeAction: 'capture'
      })

      // CRITICAL: Use requestAnimationFrame to ensure Excalidraw processes the first update
      // before we force the re-render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const currentElements = excalidrawAPI.getSceneElements() || []
          const textElementIds = validElements.filter((v: any) => v.type === 'text').map((v: any) => v.id)
          
          const forceRenderElements = currentElements.map((el: any) => {
            // Only update text elements that were just added
            if (el.type === 'text' && textElementIds.includes(el.id)) {
              return {
                ...el,
                version: el.version + 2,
                versionNonce: Math.floor(Math.random() * 1e9),
                updated: Date.now(),
                baseline: el.fontSize || 20,
              }
            }
            return el
          })
          
          excalidrawAPI.updateScene({
            elements: forceRenderElements,
            appState: {},
            storeAction: 'capture'
          })
        })
      })

      console.log('Diagram elements added to scene')

    } catch (error) {
      console.error('Error rendering diagram:', error)

      const errorContent = Array.isArray(response.content)
        ? response.content.join('\n')
        : response.content

      // Get current elements for positioning
      const currentElements = excalidrawAPI.getSceneElements() || []

      // Calculate position for error message
      const errorPosition = calculateSmartPosition(
        currentElements,
        'note',
        response.groupId,
        500,
        200
      )

      const groupIds = response.groupId ? [response.groupId] : []

      // Create a more helpful error message
      const errorMessage = `⚠️ Unable to create diagram\n\n` +
        `Error: ${error.message || String(error)}\n\n` +
        `Original content:\n${errorContent.substring(0, 150)}${errorContent.length > 150 ? '...' : ''}\n\n` +
        `Tip: The diagram syntax may have issues. Try simplifying the diagram or check for special characters in labels.`

      // Create error display elements
      const errorRect = createRectangleElement({
        x: errorPosition.x,
        y: errorPosition.y,
        width: 500,
        height: 200,
        strokeColor: '#ef4444',
        backgroundColor: '#fee2e2',
        roundness: { type: 3 },
      })
      errorRect.groupIds = groupIds

      const errorText = createTextElement({
        x: errorPosition.x + 20,
        y: errorPosition.y + 20,
        text: errorMessage,
        fontSize: 16,
        textAlign: 'left',
        verticalAlign: 'top',
        containerId: null,
      })
      errorText.groupIds = groupIds

      // Optional heading
      let errorHeading: ExcalidrawElement | null = null
      if (response.title && typeof response.title === 'string' && response.title.trim()) {
        errorHeading = createTextElement({
          x: errorPosition.x,
          y: errorPosition.y - 50,
          text: `${response.title.trim()} (Error)`,
          width: 500,
          height: 40,
          fontSize: 24,
          textAlign: 'center',
          verticalAlign: 'middle',
          containerId: null,
        })
        errorHeading.groupIds = groupIds
      }

      const errorElements = errorHeading
        ? [...currentElements, errorRect, errorHeading, errorText]
        : [...currentElements, errorRect, errorText]

      excalidrawAPI.updateScene({
        elements: errorElements,
        appState: {},
        storeAction: 'capture'
      })

      console.log('Error message displayed to user')
    }
  }
}