# Jarvis Calendar

A calendar application that shares the Jarvis identity and can use your local Ollama-backed Jarvis model for chat, alongside events, Canvas sync, and study scheduling.

## Features

- Event management for classes, assignments, exams, and study sessions
- Jarvis Scheduler recommendations based on workload
- Jarvis chat for calendar help, general questions, and scheduling guidance
- Canvas integration for automatic assignment import
- Persistent Canvas connections
- Responsive browser UI
- Real-time event updates
- iPhone subscription calendar feed

## Security Note

For personal use, keep secrets in `.env` and never commit that file. This repo now includes `.env.example` so the Ollama/Jarvis setup can be committed safely without leaking real keys or tokens.

## Stack

Frontend:
- React 18
- Axios
- react-big-calendar

Backend:
- Node.js + Express
- Canvas API integration
- Local Ollama-compatible chat path for Jarvis

## Installation

1. Open the project:
```bash
cd "AI Calender"
```

2. Install dependencies:
```bash
npm run install-all
```

## Jarvis Local LLM Setup

This calendar app supports the same simple local Jarvis setup pattern as the main project.

1. Start Ollama:
```bash
ollama serve
```

2. Make sure the local model is available:
```bash
ollama pull qwen3:32b
```

3. Copy the example environment file if needed:
```bash
copy .env.example .env
```

4. Start the calendar app with the local Jarvis launcher:
```powershell
.\run_jarvis_calendar_local.ps1
```

Default local model environment:
```bash
AI_LOCAL_LLM_API_KEY=EMPTY
AI_LOCAL_LLM_API_BASE=http://127.0.0.1:11434/v1
AI_LOCAL_LLM_MODEL=qwen3:32b
AI_LOCAL_LLM_TIMEOUT_SECONDS=240
```

This keeps the calendar repo ready to commit with the Ollama/Jarvis setup in repo files, while leaving the real `.env` ignored.

## Running the Application

Option 1: local Jarvis launcher
```powershell
.\run_jarvis_calendar_local.ps1
```

Option 2: run separately

Backend:
```bash
npm start
```

Frontend dev client:
```bash
npm run client
```

Local URLs:
- frontend dev client: `http://localhost:3000`
- backend / built UI: `http://localhost:5000`

## Canvas Integration Setup

1. Enter your Canvas token in the Canvas settings panel
2. Enter your username/email
3. Connect Canvas
4. Sync assignments
5. Optionally use syllabus scan for extra deadline extraction

## Azure Deployment

To use the subscription calendar remotely, the backend must be reachable from the internet.

Recommended Azure environment:
```bash
NODE_ENV=production
CALENDAR_FEED_TOKEN=your-long-random-secret-token
AI_LOCAL_LLM_API_KEY=EMPTY
AI_LOCAL_LLM_API_BASE=https://your-local-llm-proxy.example/v1
AI_LOCAL_LLM_MODEL=qwen3:32b
```

Build command:
```bash
npm install && npm run build:azure
```

Startup command:
```bash
npm start
```

## Important Files

- `server.js` - Express backend and Jarvis calendar chat logic
- `.env.example` - commit-safe Ollama/Jarvis environment template
- `run_jarvis_calendar_local.ps1` - local Ollama launcher
- `client/src/App.js` - main UI
- `client/src/components/ChatBot.js` - Jarvis chat widget
- `client/src/components/AIScheduler.js` - Jarvis scheduler panel
- `services/canvasService.js` - Canvas API wrapper

## API Endpoints

- `GET /api/health`
- `GET /api/events`
- `POST /api/events`
- `DELETE /api/events/:id`
- `POST /api/chat`
- `POST /api/canvas/auth`
- `GET /api/canvas/status`
- `POST /api/canvas/sync`
- `POST /api/canvas/disconnect`
- `GET /api/calendar/subscription`
- `GET /api/calendar/feed/:token`

## Current Chat Capabilities

Jarvis chat in the calendar app can currently:
- list upcoming events
- add simple events from natural phrases
- delete events by title
- report Canvas connection status
- return the subscription feed URL
- answer broader questions through the same local Ollama-backed Jarvis model
