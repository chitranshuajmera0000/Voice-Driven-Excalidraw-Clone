# Voice-Driven Excalidraw Assistant

Turn any spoken brief into a clean Excalidraw canvas that stays organized, readable, and always in sync with ongoing conversations.

## Overview

This project wraps Excalidraw with a real-time voice assistant that understands natural speech, decides whether your request should become a checklist note, a flowchart, or both, and renders everything instantly. It is optimized for continuous meetings or brainstorming sessions where diagrams evolve as you speak.

## Key Features

- **Hands-free capture** – Start or stop listening with a single tap; transcripts are streamed directly into the assistant.
- **Context-aware parsing** – The backend analyzes each utterance to detect checklists versus processes, and can return both simultaneously using a `multi` response schema.
- **Smart updates** – Saying things like “scratch that list” or “insert a new step” replaces the previous note/diagram instead of creating duplicates.
- **Shared grouping** – Notes and flowcharts created in the same exchange share a `groupId`, so positional logic keeps related items together on the canvas.
- **Structured rendering**  
  - Notes always use bullet points, enforce punctuation, and display a centered heading.  
  - Flowcharts are generated from Mermaid syntax, normalized for Excalidraw, and receive their own headings.  
  - People + roles are formatted automatically as `Name (Role)` for clarity.
- **Parentheses requirement for roles** – Any line mentioning a person and their responsibility is rewritten as `Person (Role)` to keep ownership obvious.
- **Error resilience** – Robust JSON parsing, fallback strategies, and user messaging protect against malformed model responses or transient API failures.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, wait for Excalidraw to finish loading, and click the mic icon. Continuous mode keeps the session hands-free; disable it to approve each transcript manually.

## Using the Voice Assistant

1. Speak naturally. Mention “Part 1 / Part 2” or just describe both the checklist and the process; the AI figures it out.
2. To revise existing content, use phrases like “scratch that resource list” or “insert a step after…”.
3. The assistant replies with both the structured data (notes/diagrams) and auto-generated headings so the canvas remains tidy.
4. Review the conversation history from the assistant panel if you need to recall what was said.

## Testing

```bash
npm test
```

## License

MIT (see `LICENSE` if provided). Adapt as needed for your deployment.