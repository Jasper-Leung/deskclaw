<div align="center">

# DeskClaw

**Local-first, privacy-focused AI Agent desktop application**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-35.0.0-blue)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue)](https://react.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1.6-black)](https://nextjs.org/)

</div>

## Overview

DeskClaw is a desktop application that brings the power of AI agents to your local machine. It prioritizes privacy by storing all data locally and supports multiple AI providers including OpenAI, Anthropic, Ollama, and custom endpoints.

## Features

- **Multiple AI Provider Support**: Connect to OpenAI, Anthropic, Ollama, or custom APIs
- **Custom Model Persistence**: Add custom models with connection testing - models persist across restarts
- **Streaming LLM Responses**: Real-time streaming output for chat interactions
- **Session Management**: Conversations are saved and can be resumed anytime
- **Workflow Visual Editor**: Drag-and-drop workflow canvas with multiple node types
- **Approval Gate**: Security mechanism for dangerous shell commands
- **Local Data Storage**: All conversations, agents, and workflows stored locally with SQLite
- **Encryption**: API keys encrypted with AES-256-GCM
- **Memory System**: Long-term memory storage for agents
- **Scheduled Tasks**: Automate workflows with cron-like scheduling
- **System Tray**: Background execution with quick access
- **Modern UI**: Built with shadcn/ui and Tailwind CSS

## Tech Stack

- **Electron**: Desktop application framework
- **Next.js 15**: React framework with App Router
- **React 19**: Latest React features
- **Better-SQLite3**: Local database storage
- **shadcn/ui**: UI component library
- **Tailwind CSS**: Utility-first styling
- **Zustand**: State management
- **React Flow**: Workflow visual editor
- **Vercel AI SDK**: LLM integration
- **TypeScript**: Type-safe development

## Project Structure

```
deskclaw/
├── electron/              # Electron main process
│   ├── main/
│   │   ├── index.ts       # Main entry point
│   │   ├── ipc/           # IPC handlers
│   │   │   ├── providers.ts   # Provider management
│   │   │   ├── models.ts      # Model management
│   │   │   ├── llm.ts         # LLM streaming
│   │   │   ├── shell.ts       # Shell execution with approval
│   │   │   └── ...
│   │   ├── db/            # Database layer
│   │   └── tray/          # System tray
│   └── preload/
│       └── index.ts       # Preload script
├── next/                  # Next.js app
│   ├── app/               # Pages
│   │   ├── chat/          # Quick Chat with streaming
│   │   ├── agents/        # Agent management
│   │   ├── workflows/     # Workflow editor
│   │   ├── memory/        # Memory vault
│   │   ├── skills/        # Skills sandbox
│   │   ├── scheduled/     # Scheduled tasks
│   │   └── settings/      # Provider & Model settings
│   ├── components/
│   │   ├── layout/        # App shell, sidebar
│   │   ├── workflow/      # Workflow canvas & nodes
│   │   ├── approval/      # Approval gate dialog
│   │   └── ui/            # UI components
│   └── lib/               # Utilities & store
├── shared/                # Shared types
│   └── types/
└── package.json
```

## Key Features Detail

### Custom Model Persistence

Custom models are properly persisted in SQLite and survive app restarts:

1. Add a provider (OpenAI, Anthropic, Ollama, or Custom)
2. Add custom models with **Test & Save** - connection is verified before saving
3. Models are grouped by Built-in/Custom in dropdowns
4. Set a default model for Quick Chat

### LLM Streaming

Real-time streaming responses in chat:

```typescript
// Streaming is handled via IPC events
window.electronAPI.llm.stream(request);
window.electronAPI.llm.onStreamChunk((chunk) => {
  // Handle streaming content
});
```

### Workflow Visual Editor

Drag-and-drop workflow canvas with nodes:

- **Trigger**: Manual or Cron-based triggers
- **Agent**: AI agent with model selection
- **Tool**: Custom tool execution
- **Prompt**: Static prompt templates
- **Shell**: Terminal command execution
- **Conditional**: Branching logic

### Approval Gate

Security mechanism for dangerous commands:

- Automatic detection of dangerous shell commands
- Popup dialog for user approval
- System notification alerts
- Timeout for pending approvals

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Run in development mode:

```bash
npm run dev
```

This will start:

- Next.js dev server on http://localhost:3000
- Electron window

### Building for Production

1. Build the application:

```bash
npm run build
```

2. Package for your platform:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Development

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Optional: Custom encryption key for API keys
DESKCLAW_ENCRYPTION_KEY=your-32-byte-hex-key
```

### Database

The SQLite database is stored in:

- Windows: `%APPDATA%/deskclaw/data/deskclaw.db`
- macOS: `~/Library/Application Support/deskclaw/data/deskclaw.db`
- Linux: `~/.config/deskclaw/data/deskclaw.db`

## Architecture

### IPC Communication

The app uses Electron's IPC for communication between main and renderer processes:

```typescript
// Renderer process
const result = await window.electronAPI.providers.list();

// Streaming
await window.electronAPI.llm.stream(request);
const unsubscribe = window.electronAPI.llm.onStreamChunk(callback);

// Shell with approval
await window.electronAPI.shell.execute(command, { requireApproval: true });
```

### Database Schema

- **providers**: AI provider configurations with encrypted API keys
- **models**: Available models per provider (supports custom models)
- **agents**: Agent configurations with model bindings
- **sessions**: Chat conversations with message history
- **workflows**: Workflow definitions with node/edge JSON
- **memories**: Agent long-term memory
- **skills**: Custom skill definitions
- **scheduled_tasks**: Scheduled workflow executions

### State Management

Zustand is used for client-side state:

```typescript
const { currentModel, setCurrentModel, theme, setTheme } = useAppStore();
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

- GitHub Issues: [Report bugs or request features](https://github.com/Jasper-Leung/deskclaw/issues)
- GitHub Discussions: [Community discussions](https://github.com/Jasper-Leung/deskclaw/discussions)

## 🔒 Privacy & Security

- **Local-First**: All data stored locally by default
- **Encrypted API Keys**: AES-256-GCM encryption for sensitive data
- **No Telemetry**: No data collection or tracking
- **Approval Gates**: User approval required for dangerous operations

See [SECURITY.md](SECURITY.md) for detailed security information.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each version.

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Styling with [Tailwind CSS](https://tailwindcss.com/)
- LLM integration via [Vercel AI SDK](https://sdk.vercel.ai/)
- Workflow editor with [React Flow](https://reactflow.dev/)
