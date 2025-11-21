import { NextRequest, NextResponse } from 'next/server'

// --- Types ---

interface AIResponse {
  type: 'note' | 'diagram' | 'multi'
  content: any // string or array of objects
  title?: string
}

// --- Rate Limiting (In-Memory) ---

const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30
const rateMap: Map<string, { count: number; windowStart: number }> = new Map()

function checkRateLimit(req: NextRequest): boolean {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const entry = rateMap.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false
  }

  entry.count++
  return true
}

// --- JSON Cleaning Utility ---

/**
 * Cleans common LLM JSON formatting errors before parsing
 */
function cleanJsonOutput(text: string): string {
  let cleaned = text.trim()

  // Remove Markdown code blocks (```json ... ```)
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '')

  // Find the outer JSON object
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  // Sanitize control characters within strings while preserving structure
  // This regex specifically targets unescaped newlines inside quotes
  // Note: This is a heuristic; perfect JSON repair is complex.
  cleaned = cleaned.replace(/(?<=:\s*")(.+?)(?=")/gs, (match) => {
    return match
      .replace(/(?<!\\)\n/g, '\\n') // Escape newlines
      .replace(/(?<!\\)\r/g, '')     // Remove carriage returns
      .replace(/\t/g, '\\t')         // Escape tabs
  })

  return cleaned
}

// --- Main Handler ---

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limit Check
    if (!checkRateLimit(request)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // 2. Input Validation
    const { transcript, conversationHistory = [] } = await request.json()

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    const cleanTranscript = transcript.trim().slice(0, 6000) // Reasonable char limit

    // 3. Context Building
    // We format history to clearly distinguish between User commands and previous AI State
    const formattedHistory = conversationHistory.slice(-6).map((msg: any) => {
        if (msg.role === 'user') return `USER REQUEST: ${msg.content}`
        // If it's assistant, we try to show the structured content so the AI knows what to update
        try {
          const parsed = JSON.parse(msg.content)
          if(parsed.type === 'multi') {
             return `CURRENT AI STATE (Multi): ${JSON.stringify(parsed.content)}`
          }
          return `CURRENT AI STATE (${parsed.type}): ${parsed.content}`
        } catch {
          return `CURRENT AI STATE: ${msg.content}`
        }
    }).join('\n\n')

    const contextBlock = formattedHistory 
      ? `\n=== CONVERSATION HISTORY (For Context Updates) ===\n${formattedHistory}\n==================================================` 
      : ''

    // 4. The Optimized System Prompt
    const systemPrompt = `You are an expert Visual Architect AI for Excalidraw. Your goal is to turn voice transcripts into structured JSON data for diagrams and notes.

### CORE RESPONSIBILITY
Analyze the user's request. It may contain:
1. A process/workflow (Output: 'diagram' with Mermaid syntax)
2. A checklist/notes (Output: 'note' with bullet points)
3. BOTH mixed together (Output: 'multi')
4. An UPDATE to previous content (You must act as a STATE MANAGER)

### CRITICAL RULES FOR UPDATES
The frontend is "dumb". It only renders exactly what you send.
- If the user says "Add a step after X", do not output just the new step. You must look at the "CURRENT AI STATE" in history, rewrite the ENTIRE Mermaid code including the new step, and return the FULL valid diagram.
- If the user says "Scratch that list", ignore previous notes and output the new list.
- If the user says "Change the name to Bob", output the FULL note/diagram with the name changed.

### OUTPUT FORMATS

**Type 1: Diagram (Mermaid Flowchart)**
- Use 'flowchart TD' (Top-Down) or 'flowchart LR' (Left-Right).
- Node IDs must be simple alphanumeric (A, B, C, node1). Avoid spaces in IDs.
- Labels go in brackets: A[Start Process] --> B{Decision?}
- formatting: If a person and role are mentioned, use: Name (Role).

**Type 2: Note (Checklist)**
- Content MUST be a single string with newlines.
- ALWAYS use '• ' (bullet + space) for items.
- Group related items.

**Type 3: Multi (Mixed Content)**
- Use this when the user describes a process AND a separate list of items in one go.
- Return an array of objects inside 'content'.

### RESPONSE SCHEMA (STRICT JSON)

**Option A: Single Item**
{
  "type": "diagram" | "note",
  "title": "Short Heading (e.g. 'Login Workflow')",
  "content": "string..."
}

**Option B: Multi-Part (Mixed)**
{
  "type": "multi",
  "content": [
    { "type": "diagram", "title": "...", "content": "..." },
    { "type": "note", "title": "...", "content": "..." }
  ]
}

### INPUT TRANSCRIPT
"${cleanTranscript}"

${contextBlock}

Analyze the transcript. If it requires updating previous work, merge the new request with the history to produce the FINAL DESIRED STATE. Return ONLY valid JSON.`

    // 5. Mistral API Call
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest', // Fast and capable enough
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.2, // Low temperature for deterministic JSON
        response_format: { type: 'json_object' }, // Force JSON mode if supported
        max_tokens: 2000,
      }),
    })

    if (!mistralResponse.ok) {
      throw new Error(`Mistral API Error: ${mistralResponse.statusText}`)
    }

    const completion = await mistralResponse.json()
    const rawContent = completion.choices?.[0]?.message?.content || ''

    // 6. Robust JSON Parsing
    let aiResponse: AIResponse
    try {
      const cleanedJson = cleanJsonOutput(rawContent)
      aiResponse = JSON.parse(cleanedJson)
    } catch (e) {
      console.error('JSON Parse Failed:', e)
      console.log('Raw Content:', rawContent)
      
      // Fallback: Try to salvage text if JSON fails completely
      aiResponse = {
        type: 'note',
        title: 'Transcription Note (Parse Error)',
        content: `• ${cleanTranscript.replace(/\n/g, '\n• ')}`
      }
    }

    // 7. Final Structure Validation
    if (!['note', 'diagram', 'multi'].includes(aiResponse.type)) {
        aiResponse.type = 'note' // Default fallback
    }
    
    // Ensure 'multi' content is always an array
    if (aiResponse.type === 'multi' && !Array.isArray(aiResponse.content)) {
        aiResponse.type = 'note' // Downgrade if structure is wrong
        aiResponse.content = String(aiResponse.content)
    }

    return NextResponse.json(aiResponse)

  } catch (error) {
    console.error('Route Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    )
  }
}