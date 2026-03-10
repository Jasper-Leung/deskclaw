# DeskClaw Architecture

This document describes the architecture and design decisions of DeskClaw.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Security Model](#security-model)
- [Technology Choices](#technology-choices)

## Overview

DeskClaw is a local-first AI Agent desktop application built with Electron and Next.js. The application prioritizes privacy, performance, and extensibility.

### Key Design Principles

1. **Local-First**: All data stored locally, cloud services optional
2. **Privacy-Focused**: Encryption for sensitive data, no telemetry
3. **Extensible**: Plugin system for skills and integrations
4. **Type-Safe**: Full TypeScript coverage
5. **Modern**: Latest React, Next.js, and Electron features

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      DeskClaw App                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────┐         ┌──────────────────┐      │
│  │   Renderer       │         │   Main Process   │      │
│  │   (Next.js)      │◄────────┤   (Electron)     │      │
│  │                  │  IPC    │                  │      │
│  │  ┌────────────┐  │         │  ┌────────────┐  │      │
│  │  │   Pages    │  │         │  │  IPC Layer │  │      │
│  │  └────────────┘  │         │  └────────────┘  │      │
│  │  ┌────────────┐  │         │  ┌────────────┐  │      │
│  │  │ Components │  │         │  │  Services  │  │      │
│  │  └────────────┘  │         │  └────────────┘  │      │
│  └──────────────────┘         │  ┌────────────┐  │      │
│                                │  │  Database  │  │      │
│                                │  └────────────┘  │      │
│                                └──────────────────┘      │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Process Model

**Main Process (Electron)**

- Application lifecycle management
- Window management
- System tray integration
- Native OS integration
- Database operations
- Background services

**Renderer Process (Next.js)**

- UI rendering
- User interactions
- State management
- Client-side validation

**IPC Communication**

- Typed IPC contracts
- Event-based messaging
- Streaming support for LLM
- Error propagation

## Component Architecture

### Frontend Components

```
next/
├── app/                    # Next.js App Router pages
│   ├── chat/              # Quick Chat interface
│   ├── agents/            # Agent management
│   ├── workflows/         # Workflow editor
│   ├── memory/            # Memory management
│   ├── skills/            # Skills marketplace
│   └── settings/          # Configuration
├── components/
│   ├── layout/            # App shell, navigation
│   ├── workflow/          # Workflow components
│   ├── ui/                # Reusable UI components
│   └── optimized/         # Performance-optimized
└── lib/
    ├── logger.ts          # Logging system
    ├── error-utils.ts     # Error handling
    └── stores/            # State management
```

### Backend Services

```
electron/main/
├── ipc/                   # IPC handlers
│   ├── providers.ts       # AI provider management
│   ├── models.ts          # Model management
│   ├── llm.ts             # LLM streaming
│   ├── workflows.ts       # Workflow execution
│   └── channels/          # Channel integrations
├── db/                    # Database layer
│   ├── index.ts           # Database initialization
│   └── encryption.ts      # Encryption utilities
├── workflow-engine/       # Workflow execution
├── tools/                 # Built-in tools
├── skills/                # Skills system
├── channels/              # Platform integrations
└── lib/                   # Shared utilities
    ├── logger.ts          # Logging system
    └── error-handler.ts   # Global error handling
```

## Data Flow

### LLM Streaming Flow

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ User   │────▶│ Next.js│────▶│  IPC   │────▶│  AI    │
│ Input  │     │ Render │     │ Handler│     │ Provider│
└────────┘     └────────┘     └────────┘     └────────┘
                                     │
                                     ▼
                              ┌──────────────────┐
                              │  Stream Chunks   │
                              └──────────────────┘
                                     │
                                     ▼
                              ┌────────┐     ┌────────┐
                              │  IPC   │────▶│ Display │
                              │ Events │     │ Output  │
                              └────────┘     └────────┘
```

### Workflow Execution Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Workflow   │────▶│    Parser    │────▶│   Execution  │
│ Definition   │     │              │     │   Engine     │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    ▼                             ▼                             ▼
              ┌───────────┐                 ┌───────────┐                 ┌───────────┐
              │ LLM Nodes │                 │Tool Nodes │                 │Shell Nodes│
              └───────────┘                 └───────────┘                 └───────────┘
                    │                             │                             │
                    └─────────────────────────────┼─────────────────────────────┘
                                                  ▼
                                          ┌──────────────┐
                                          │  Progress    │
                                          │  Events      │
                                          └──────────────┘
```

### Database Schema

Key tables:

- `providers` - AI provider configurations
- `models` - Available models per provider
- `agents` - Agent configurations
- `sessions` - Chat sessions
- `workflows` - Workflow definitions
- `memories` - Long-term memory storage
- `scheduled_tasks` - Automation tasks
- `channels` - Platform integrations
- `tools` - Tool registry
- `skills` - Custom skills

## Security Model

### Encryption

- **Algorithm**: AES-256-GCM
- **Key Management**: Environment variable or auto-generated
- **Encrypted Data**: API keys, sensitive credentials

### Data Storage

- **Location**: User data directory
- **Format**: SQLite database
- **Permissions**: OS-managed file permissions

### IPC Security

- **Context Isolation**: Enabled in preload scripts
- **Validation**: Input validation on both ends
- **Error Handling**: Secure error messaging

### External Connections

- **User-Controlled**: All external connections opt-in
- **URL Validation**: Validate all URLs before connection
- **Certificate Verification**: HTTPS/TLS verification

## Technology Choices

### Why Electron?

- Cross-platform desktop support
- Access to native APIs
- Large ecosystem
- Web technologies

### Why Next.js?

- Modern React framework
- Excellent developer experience
- Built-in optimizations
- App Router for routing

### Why Better-SQLite3?

- Synchronous API (simpler code)
- Embedded database (no server needed)
- Reliable and mature
- Good performance for local apps

### Why React Flow?

- Best-in-class workflow visualization
- Highly customizable
- Active development
- Good TypeScript support

### Why Zustand?

- Simple and lightweight
- No boilerplate
- TypeScript support
- Easy to learn

## Performance Considerations

### Rendering

- **Virtual Scrolling**: For large lists
- **React.memo**: For expensive components
- **Code Splitting**: Route-based splitting
- **Lazy Loading**: For heavy components

### Data Management

- **Optimistic Updates**: For better UX
- **Debouncing**: For search/filter inputs
- **Pagination**: For large datasets
- **Caching**: For expensive operations

### Memory Management

- **Cleanup**: Proper effect cleanup
- **Streaming**: For large responses
- **Connection Pooling**: For external services
- **Resource Limits**: For memory-intensive operations

## Extension Points

### Skills System

Custom skills can:

- Define custom tools
- Implement AI workflows
- Add UI components
- Access core APIs

### Channel Integrations

New channels can:

- Connect to messaging platforms
- Handle incoming/outgoing messages
- Manage webhooks
- Store conversation history

### Tools

Custom tools can:

- Execute system commands
- Call external APIs
- Process data
- Return structured results

## Future Considerations

- Plugin marketplace
- Multi-tenant support
- Cloud sync (optional)
- Mobile app (React Native)
- API server mode
- Container deployment
