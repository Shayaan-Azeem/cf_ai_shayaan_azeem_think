# cf_ai_shayaan_azeem_think

Think is my AI-powered note-taking application. I built it as a local-first markdown workspace and then added a Cloudflare-powered chat layer so I can ask questions about my notes, inspect specific documents, and propose edits safely before applying them.

This project is my submission for Cloudflare's optional AI assignment.
Prompt history/reference: @prompt.md

## Why I built this

I wanted a writing tool where:

- my notes stay as plain markdown files on disk
- search is fast even with a large library
- AI can help me reason about my own knowledge base instead of a generic chat
- AI edits are reviewable and not silently applied

The result is a hybrid architecture:

- **Desktop app (Tauri + React + Rust)** for local-first editing, indexing, and note management
- **Cloudflare Worker + Durable Object chat agent** for real-time AI conversations with tool use

## Assignment requirements checklist

This app includes all required components:

- **LLM**: Workers AI model used in the chat agent (`@cf/zai-org/glm-4.7-flash`)
- **Workflow / coordination**: Cloudflare Worker + Durable Objects (`ChatAgent`) coordinate chat turns and tool calling
- **User input (chat/voice)**: chat input in the app UI (text chat)
- **Memory / state**:
  - conversational state is maintained per thread via Durable Objects
  - note memory/state lives in local markdown files and app context

Reference: [agents.cloudflare.com](https://agents.cloudflare.com/)

## What the application does

### Core notes experience

- Creates, edits, deletes, and reads markdown notes
- Stores notes in a user-selected folder (portable, git-friendly)
- Auto-saves with debounce
- Watches filesystem changes and reloads notes when files are updated externally
- Full-text search with Tantivy in Rust
- Keyboard-first UX (command palette, shortcuts, quick navigation)

### Rich editor experience

- TipTap editor with markdown support
- Formatting toolbar, slash commands, code blocks, tables, task lists
- Mermaid diagram rendering
- Source mode and focus mode
- Copy/export support (Markdown, text, HTML, PDF)

### AI features

- Cloudflare chat panel to ask questions about notes
- Tool-based retrieval flow:
  - `searchNotes` to locate relevant notes
  - `readNote` to pull full note content
  - `proposeNoteEdit` to generate a full revised markdown proposal
- Proposed edits are shown as diffs and only applied after user approval

## Screenshots

### To Read home view

![To Read home view](docs/screenshots/home-to-read.png)

### Chat note search

![Chat note search](docs/screenshots/chat-note-search.png)

### Chat edit proposal with diff

![Chat edit proposal with diff](docs/screenshots/chat-edit-proposal.png)

## Cloudflare stack choices (what I chose and why)

### 1) Workers + Durable Objects for coordination

I used a Worker entrypoint with a `ChatAgent` Durable Object. This gives me:

- per-thread conversational state
- deterministic routing of messages to the correct thread/agent instance
- a clean place to host model orchestration and tool definitions

This was a better fit than putting orchestration logic inside the desktop app because it keeps agent behavior centralized and makes remote deployment straightforward.

### 2) Workers AI model choice

In `workers/chat-agent/src/server.ts`, the model is:

- `@cf/zai-org/glm-4.7-flash`

I chose a fast model optimized for responsive chat + tool orchestration. The app is built so the model binding stays behind the Worker layer, so swapping to another Workers AI model (including Llama variants) is easy without changing frontend chat behavior.

### 3) Agent tooling design

I intentionally constrained the toolset to three primitives:

- `searchNotes`
- `readNote`
- `proposeNoteEdit`

This keeps agent behavior focused, auditable, and safer for a note app:

- retrieve first
- verify with full note content
- propose edits instead of silently mutating user data

### 4) Local-first memory model

I kept note storage local (markdown on disk) and used Cloudflare only for agent reasoning/runtime coordination. This gives privacy and portability for core data, while still getting cloud-based AI interaction.

## Architecture overview

### Desktop app

- **Frontend**: React 19 + TypeScript + Tailwind
- **Backend**: Tauri v2 + Rust
- **Editor**: TipTap
- **Search**: Tantivy
- **State**: React contexts (`NotesContext`, `ThemeContext`, `GitContext`)

### Cloudflare AI service

- `workers/chat-agent/src/server.ts`:
  - defines `ChatAgent` extending `AIChatAgent`
  - streams model output
  - registers tool contracts with Zod schemas
  - routes requests with `routeAgentRequest`
- `workers/chat-agent/wrangler.jsonc`:
  - Workers AI binding (`AI`)
  - Durable Object binding (`ChatAgent`)
  - DO migration for SQLite-backed class

## Running the project

### 1) Install dependencies

From repo root:

```bash
npm install
```

From chat worker folder:

```bash
cd workers/chat-agent
npm install
```

### 2) Run the desktop app locally

From repo root:

```bash
npm run tauri dev
```

### 3) Run the Cloudflare chat agent locally

In `workers/chat-agent/`:

```bash
npm run dev
```

Wrangler will print a local URL for the Worker.

### 4) Connect the app to the Worker

In Think:

- open **Settings**
- go to **General -> Chat Agent**
- paste your Worker URL in `chatWorkerUrl`

After saving, the Chat view will use that Worker for AI conversations.

### 5) Deploy the chat agent

In `workers/chat-agent/`:

```bash
npm run deploy
```

Then paste the deployed `*.workers.dev` URL into app settings.

## Repository naming note

For assignment review, the repository should be prefixed with `cf_ai_`.  
This repository uses that convention: `cf_ai_shayaan_azeem_think`.

## Tech decisions and tradeoffs

- **Tauri over Electron**: lower resource footprint and native performance
- **Rust for index/search and file I/O**: fast local operations + strong typing
- **Cloudflare Agent layer over direct frontend-to-LLM**: better control of prompting, tools, and state
- **Durable Objects for thread memory**: simple and reliable session coordination
- **Proposal-based edits**: user trust and safety over fully automatic write-back

## Current limitations / next steps

- Voice input is not implemented yet (chat is text-first)
- I can add model selection in settings to switch Workers AI models at runtime
- I can add richer retrieval ranking across note metadata and embeddings
- I can expose deployed demo URL + screenshots in this README when publishing

## Project structure (key files)

- `src/` - desktop frontend
- `src-tauri/` - Rust backend for Tauri commands
- `workers/chat-agent/` - Cloudflare Worker + Durable Object AI chat service

Key files:

- `workers/chat-agent/src/server.ts`
- `workers/chat-agent/wrangler.jsonc`
- `src/components/chat/ChatView.tsx`
- `src/components/chat/chat-tools.ts`
- `src/components/settings/GeneralSettingsSection.tsx`

