# Quick Fixes - Priority Actions

## 🔴 Immediate Fixes (Do These First)

### 1. Replace Global Window Object with React Context

**Problem:** Using `window.excalidrawAPI` breaks React patterns

**Solution:** Create a Context Provider

**File:** `src/contexts/ExcalidrawContext.tsx` (NEW)
```typescript
'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { ExcalidrawAPIRef } from '../types/excalidraw'

interface ExcalidrawContextType {
  api: ExcalidrawAPIRef | null
  setAPI: (api: ExcalidrawAPIRef | null) => void
}

const ExcalidrawContext = createContext<ExcalidrawContextType | undefined>(undefined)

export function ExcalidrawProvider({ children }: { children: ReactNode }) {
  const [api, setAPI] = useState<ExcalidrawAPIRef | null>(null)
  
  return (
    <ExcalidrawContext.Provider value={{ api, setAPI }}>
      {children}
    </ExcalidrawContext.Provider>
  )
}

export function useExcalidrawAPI() {
  const context = useContext(ExcalidrawContext)
  if (!context) {
    throw new Error('useExcalidrawAPI must be used within ExcalidrawProvider')
  }
  return context
}
```

**Update:** `src/app/layout.tsx`
```typescript
import { ExcalidrawProvider } from '../contexts/ExcalidrawContext'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ExcalidrawProvider>{children}</ExcalidrawProvider>
      </body>
    </html>
  )
}
```

**Update:** `src/components/CanvasWrapper.tsx`
```typescript
import { useExcalidrawAPI } from '../contexts/ExcalidrawContext'

export function CanvasWrapper() {
  const { setAPI } = useExcalidrawAPI()
  
  const handleExcalidrawAPI = useCallback((api: any) => {
    if (api && typeof api.getSceneElements === 'function') {
      setAPI(api)
    } else {
      setAPI(null)
    }
  }, [setAPI])
  
  // ... rest of component
}
```

**Update:** `src/components/VoiceCommandCenter.tsx`
```typescript
import { useExcalidrawAPI } from '../contexts/ExcalidrawContext'

export function VoiceCommandCenter() {
  const { api: excalidrawAPI } = useExcalidrawAPI()
  
  // Replace: const excalidrawAPI = (window as any).excalidrawAPI
  // With: use the context value directly
}
```

### 2. Enable TypeScript Strict Mode

**File:** `tsconfig.json`
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 3. Enable React Strict Mode

**File:** `next.config.js`
```javascript
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
```

### 4. Add Environment Variable Validation

**File:** `src/lib/env.ts` (NEW)
```typescript
function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
}

// Validate on import
if (typeof window === 'undefined' && !env.MISTRAL_API_KEY) {
  console.warn('Warning: MISTRAL_API_KEY or OPENAI_API_KEY not set')
}
```

**Update:** `src/app/api/process-voice/route.ts`
```typescript
import { env } from '../../../lib/env'

// Replace: const apiKey = process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY
// With: const apiKey = env.MISTRAL_API_KEY
```

### 5. Add Error Boundary

**File:** `src/components/ErrorBoundary.tsx` (NEW)
```typescript
'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h2 className="text-red-800 font-semibold">Something went wrong</h2>
          <p className="text-red-600 text-sm mt-2">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

**Update:** `src/app/layout.tsx`
```typescript
import { ErrorBoundary } from '../components/ErrorBoundary'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  )
}
```

### 6. Fix Rate Limiting for Production

**Option A: Use Upstash Redis (Recommended for Vercel)**
```bash
npm install @upstash/ratelimit @upstash/redis
```

**File:** `src/lib/ratelimit.ts` (NEW)
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
})
```

**Update:** `src/app/api/process-voice/route.ts`
```typescript
import { ratelimit } from '../../../lib/ratelimit'

export async function POST(request: NextRequest) {
  const identifier = request.headers.get('x-forwarded-for') || 'anonymous'
  const { success } = await ratelimit.limit(identifier)
  
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }
  
  // ... rest of handler
}
```

**Option B: Simple in-memory with cleanup (Quick fix)**
```typescript
// Add cleanup for old entries
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateMap.delete(key)
    }
  }
}, RATE_LIMIT_WINDOW_MS)
```

### 7. Use Conversation History in API

**Update:** `src/app/api/process-voice/route.ts`
```typescript
export async function POST(request: NextRequest) {
  const { transcript, conversationHistory = [] } = await request.json()
  
  // Build messages array with history
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.role === 'assistant' 
        ? JSON.stringify(msg.content) 
        : msg.content
    })),
    { role: 'user', content: cleanTranscript },
  ]
  
  // Use messages in API call
  body: JSON.stringify({
    model: 'mistral-small-latest',
    messages,
    // ...
  })
}
```

### 8. Add Input Validation

**File:** `src/lib/validation.ts` (NEW)
```typescript
export function validateTranscript(transcript: unknown): string {
  if (typeof transcript !== 'string') {
    throw new Error('Transcript must be a string')
  }
  
  const trimmed = transcript.trim()
  
  if (trimmed.length === 0) {
    throw new Error('Transcript cannot be empty')
  }
  
  if (trimmed.length > 5000) {
    throw new Error('Transcript too long (max 5000 characters)')
  }
  
  // Basic sanitization - remove potentially dangerous characters
  return trimmed.replace(/[<>]/g, '')
}
```

**Update:** `src/app/api/process-voice/route.ts`
```typescript
import { validateTranscript } from '../../../lib/validation'

export async function POST(request: NextRequest) {
  const { transcript } = await request.json()
  
  try {
    const cleanTranscript = validateTranscript(transcript)
    // ... rest of handler
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid input' },
      { status: 400 }
    )
  }
}
```

### 9. Add Request Timeout

**Update:** `src/app/api/process-voice/route.ts`
```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

try {
  const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({ /* ... */ }),
    signal: controller.signal,
  })
  clearTimeout(timeoutId)
  // ... handle response
} catch (error) {
  clearTimeout(timeoutId)
  if (error instanceof Error && error.name === 'AbortError') {
    return NextResponse.json({ error: 'Request timeout' }, { status: 504 })
  }
  throw error
}
```

### 10. Add .env.example

**File:** `.env.example` (NEW)
```env
# AI API Configuration
# Either MISTRAL_API_KEY or OPENAI_API_KEY is required
MISTRAL_API_KEY=your_mistral_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here

# Optional: Rate Limiting (if using Upstash Redis)
# UPSTASH_REDIS_REST_URL=your_upstash_url
# UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Environment
NODE_ENV=development
```

## 📋 Implementation Checklist

- [ ] Create ExcalidrawContext and replace window object
- [ ] Enable TypeScript strict mode
- [ ] Enable React Strict Mode
- [ ] Add environment variable validation
- [ ] Add Error Boundary component
- [ ] Fix rate limiting (choose Redis or improved in-memory)
- [ ] Use conversation history in API
- [ ] Add input validation
- [ ] Add request timeout
- [ ] Create .env.example file
- [ ] Test all changes
- [ ] Update documentation

## 🚀 Next Steps After Quick Fixes

1. Add save/load functionality (localStorage)
2. Implement smart positioning for elements
3. Add accessibility features
4. Write unit tests
5. Add monitoring and error tracking

