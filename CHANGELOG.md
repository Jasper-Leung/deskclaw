# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-20

### Added

#### Core Features

- **MCP Browser Integration**: Control Chrome browser via Model Context Protocol
  - Navigate, screenshot, click, type text
  - Multi-session management with auto-sync
  - Infinite scrolling support (Douyin, Twitter, etc.)
  - JavaScript evaluation capability
- **Workflow Engine Enhancements**: New node types
  - `conditional`: Branch logic based on conditions
  - `loop`: Iterate over arrays
  - `delay`: Wait for specified duration
  - `variable`: Transform and map variables
  - `merge`: Combine multiple results
  - `switch`: Multi-way branching
  - `sub-workflow`: Call other workflows
- **Vector Embeddings & RAG System**:
  - Local TF-IDF embeddings
  - OpenAI/Cohere embedding API support
  - Semantic search with vector storage
  - Hybrid search (vector + keyword)
  - Query caching with 24h TTL
- **Evolution System**:
  - Pattern learning from user behavior
  - Predictive task generation
  - Proactive content delivery
  - Intent recognition with confidence scoring
- **Skills System**:
  - Load skills from directory
  - Execute Python/JavaScript/Shell scripts
  - Dependency management (pip/npm)
  - Skill metadata (domain, triggers)
- **Keyboard & Mouse Control**:
  - Human-like mouse movement (Bezier curves)
  - Click, drag, scroll operations
  - Keyboard typing and key combinations
  - Smart screenshot with diff compression

#### Tools

- `file_read`, `file_write`, `file_list`: File operations
- `web_search`: Web search with multiple sources
- `http_request`: HTTP GET/POST requests
- `stock_quote`: Stock market data
- `get_time`: Time in any timezone
- `set_work_directory`: Change working directory

#### Multi-Channel Support (28+ platforms)

- Discord, Telegram, Slack, WhatsApp, WeChat, Line
- Microsoft Teams, Google Chat, Mattermost
- Signal, IRC, Matrix, Twitch, Nostr
- QQ, DingTalk, Feishu, iMessage, and more

#### Other Features

- **Community API Keys**: Secure shared key management with heartbeat
- **Agent Router**: Intelligent routing to specialized agents
- **Session Management**: Per-channel sessions with enhanced LLM
- **Quick Chat**: Dedicated chat with agent binding and memory

### Changed

- Improved workflow execution with topological sorting
- Enhanced memory system with deduplication and importance adjustment
- Better error handling and recovery

### Technical

- Added `@nut-tree/nut-js` for keyboard/mouse control
- Added `@modelcontextprotocol/sdk` for MCP integration
- Upgraded to Next.js 15 and React 19

### Documentation

- Added build portable guide
- Added control tools documentation
- Improved troubleshooting guide

## [0.1.0] - 2026-03-09

### Added

- Initial release of DeskClaw
- AI Agent desktop application with Electron and Next.js
- Multiple AI provider support (OpenAI, Anthropic, Ollama, Custom)
- Custom model persistence with connection testing
- Real-time streaming LLM responses
- Session management and conversation history
- Workflow visual editor with drag-and-drop interface
- Approval gate for dangerous shell commands
- Local-first data storage with SQLite
- AES-256-GCM encryption for API keys
- Smart memory system for agents
- Scheduled task automation with cron-like scheduling
- System tray integration
- Modern UI built with shadcn/ui and Tailwind CSS
- Browser extension for web content interaction
- Multi-channel support (Slack, Discord, Telegram, etc.)

### Security

- Local-first architecture ensures data stays on your machine
- Encrypted API key storage
- Shell command approval mechanism
- No telemetry or data collection

### Documentation

- Complete README with getting started guide
- Architecture documentation
- Contributing guidelines
- Troubleshooting guide
- Security policy

## [Unreleased]

### Planned Features

- Enhanced plugin system
- More built-in skills
- Improved workflow templates
- Advanced memory capabilities
