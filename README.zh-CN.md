<div align="center">

# DeskClaw

**本地优先、注重隐私的 AI Agent 桌面应用程序**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-35.0.0-blue)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue)](https://react.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1.6-black)](https://nextjs.org/)

</div>

## 概述

DeskClaw 是一款桌面应用程序，将 AI Agent 的强大功能带到您的本地机器。它通过在本地存储所有数据来优先保护隐私，并支持多种 AI 提供商，包括 OpenAI、Anthropic、Ollama 和自定义端点。

<!-- 📸 Screenshot: Main Application Interface -->
<p align="center">
  <img src="docs/screenshots/main-interface.png" alt="DeskClaw 主界面" width="800"/>
  <br>
  <em>DeskClaw 主应用程序界面</em>
</p>

## 功能特性

### 核心功能

<!-- 📸 Screenshot: Quick Chat Interface -->
<p align="center">
  <img src="docs/screenshots/quick-chat.png" alt="快速聊天" width="700"/>
  <br>
  <em>支持 AI 流式响应的快速聊天</em>
</p>

- **多 AI 提供商支持**：连接到 OpenAI、Anthropic、Ollama 或自定义 API
- **自定义模型持久化**：添加自定义模型并测试连接 - 模型在重启后保留
- **流式 LLM 响应**：聊天交互的实时流式输出
- **会话管理**：对话保存后可随时恢复

<!-- 📸 Screenshot: Workflow Visual Editor -->
<p align="center">
  <img src="docs/screenshots/workflow-editor.png" alt="工作流编辑器" width="800"/>
  <br>
  <em>支持拖放节点的可视化工作流编辑器</em>
</p>

- **工作流可视化编辑器**：拖放式工作流画布，支持多种节点类型
- **审批门**：危险 shell 命令的安全机制
- **本地数据存储**：所有对话、代理和工作流使用 SQLite 本地存储
- **加密**：API 密钥使用 AES-256-GCM 加密

### 高级功能

- **记忆系统**：代理的长期记忆存储
- **定时任务**：使用类似 cron 的调度自动化工作流
- **系统托盘**：后台运行，快速访问
- **现代 UI**：使用 shadcn/ui 和 Tailwind CSS 构建

<!-- 📸 Screenshot: Browser Control -->
<p align="center">
  <img src="docs/screenshots/browser-control.png" alt="浏览器控制" width="800"/>
  <br>
  <em>MCP 集成的浏览器自动化</em>
</p>

- **MCP 浏览器集成**：通过模型上下文协议控制 Chrome
- **浏览器自动化**：导航、截图、点击、输入和执行 JavaScript
- **会话管理**：多个浏览器会话，自动同步
- **无限滚动支持**：通过扩展超时处理动态内容加载

<!-- 📸 Screenshot: Agent Management -->
<p align="center">
  <img src="docs/screenshots/agents.png" alt="代理管理" width="600"/>
  <br>
  <em>使用自定义配置管理 AI 代理</em>
</p>

<!-- 📸 Screenshot: Memory Vault -->
<p align="center">
  <img src="docs/screenshots/memory-vault.png" alt="记忆库" width="600"/>
  <br>
  <em>AI 代理的长期记忆存储</em>
</p>

<!-- 📸 Screenshot: Skills Sandbox -->
<p align="center">
  <img src="docs/screenshots/skills.png" alt="技能沙盒" width="600"/>
  <br>
  <em>使用自定义技能扩展功能</em>
</p>

<!-- 📸 Screenshot: Provider Settings -->
<p align="center">
  <img src="docs/screenshots/providers.png" alt="提供商设置" width="600"/>
  <br>
  <em>配置 AI 提供商并测试连接</em>
</p>

<!-- 📸 Screenshot: Approval Gate Dialog -->
<p align="center">
  <img src="docs/screenshots/approval-gate.png" alt="审批门" width="400"/>
  <br>
  <em>危险操作的安全审批</em>
</p>

<!-- 📸 Screenshot: Scheduled Tasks -->
<p align="center">
  <img src="docs/screenshots/scheduled-tasks.png" alt="定时任务" width="600"/>
  <br>
  <em>使用 cron 调度自动化工作流</em>
</p>

<!-- 📸 Screenshot: System Tray -->
<p align="center">
  <img src="docs/screenshots/system-tray.png" alt="系统托盘" width="300"/>
  <br>
  <em>系统托盘集成的后台执行</em>
</p>

## 技术栈

- **Electron**：桌面应用程序框架
- **Next.js 15**：带有 App Router 的 React 框架
- **React 19**：最新的 React 功能
- **Better-SQLite3**：本地数据库存储
- **shadcn/ui**：UI 组件库
- **Tailwind CSS**：实用优先的样式
- **Zustand**：状态管理
- **React Flow**：工作流可视化编辑器
- **Vercel AI SDK**：LLM 集成
- **@modelcontextprotocol/sdk**：MCP（模型上下文协议）集成
- **TypeScript**：类型安全的开发

## 项目结构

```
deskclaw/
├── electron/              # Electron 主进程
│   ├── main/
│   │   ├── index.ts       # 主入口点
│   │   ├── browser/      # 浏览器自动化
│   │   │   ├── mcp-browser-service.ts  # MCP 浏览器服务
│   │   │   └── ...
│   │   ├── ipc/           # IPC 处理程序
│   │   │   ├── providers.ts   # 提供商管理
│   │   │   ├── models.ts      # 模型管理
│   │   │   ├── llm.ts         # LLM 流式传输
│   │   │   ├── shell.ts       # 带审批的 shell 执行
│   │   │   ├── mcp-browser.ts # MCP 浏览器 IPC 处理程序
│   │   │   └── ...
│   │   ├── db/            # 数据库层
│   │   └── tray/          # 系统托盘
│   └── preload/
│       └── index.ts       # 预加载脚本
├── next/                  # Next.js 应用
│   ├── app/               # 页面
│   │   ├── chat/          # 带流式传输的快速聊天
│   │   ├── browser/       # 浏览器控制 UI
│   │   ├── agents/        # 代理管理
│   │   ├── workflows/     # 工作流编辑器
│   │   ├── memory/        # 记忆库
│   │   ├── skills/        # 技能沙盒
│   │   ├── scheduled/     # 定时任务
│   │   └── settings/      # 提供商和模型设置
│   ├── components/
│   │   ├── layout/        # 应用外壳、侧边栏
│   │   ├── workflow/      # 工作流画布和节点
│   │   ├── approval/      # 审批门对话框
│   │   └── ui/            # UI 组件
│   └── lib/               # 工具和存储
├── shared/                # 共享类型
│   └── types/
├── scripts/               # 构建和工具脚本
└── package.json
```

## 核心功能详解

### 自定义模型持久化

自定义模型在 SQLite 中正确持久化，并在应用重启后保留：

1. 添加提供商（OpenAI、Anthropic、Ollama 或自定义）
2. 使用"测试并保存"添加自定义模型 - 保存前验证连接
3. 模型在下拉菜单中按内置/自定义分组
4. 为快速聊天设置默认模型

### LLM 流式传输

聊天中的实时流式响应：

```typescript
// 流式传输通过 IPC 事件处理
window.electronAPI.llm.stream(request);
window.electronAPI.llm.onStreamChunk((chunk) => {
  // 处理流式内容
});
```

### 工作流可视化编辑器

拖放式工作流画布，包含多种节点：

- **触发器**：手动或基于 cron 的触发器
- **代理**：带有模型选择的 AI 代理
- **工具**：自定义工具执行
- **提示词**：静态提示词模板
- **Shell**：终端命令执行
- **条件**：分支逻辑

### 审批门

危险命令的安全机制：

- 自动检测危险 shell 命令
- 弹出对话框供用户审批
- 系统通知警报
- 待处理审批的超时

### MCP 浏览器集成

通过模型上下文协议进行浏览器自动化：

```typescript
// 连接到 MCP 浏览器服务
await window.electronAPI.mcpBrowser.connect();

// 获取可用的 Chrome 标签页
const { tabs } = await window.electronAPI.mcpBrowser.getTabs();

// 导航到 URL
await window.electronAPI.mcpBrowser.navigate('https://example.com', sessionId);

// 截图
const { data } = await window.electronAPI.mcpBrowser.screenshot(sessionId);

// 与页面交互
await window.electronAPI.mcpBrowser.click('buttonSelector', sessionId);
await window.electronAPI.mcpBrowser.type('inputSelector', 'text', sessionId);

// 滚动页面
await window.electronAPI.mcpBrowser.scroll(500, sessionId);

// 执行 JavaScript
const result = await window.electronAPI.mcpBrowser.evaluate('document.title', sessionId);
```

**功能特性**：

- 与运行中的 Chrome 实例自动会话同步
- 支持无限滚动页面（如抖音、Twitter）
- 复杂页面的扩展超时处理（最长 3 分钟）
- 工具执行状态的视觉反馈
- 断开连接时自动清理会话

## 快速开始

### 前置要求

- Node.js 20+
- npm 或 yarn
- Chrome 浏览器（用于 MCP 浏览器自动化）

### MCP 浏览器设置

要使用浏览器自动化功能，您需要安装 [chrome-devtools-mcp](https://github.com/modelcontextprotocol/inspect-aurora/tree/main/chrome-devtools-mcp)：

```bash
npm install -g chrome-devtools-mcp@latest
```

然后启动 Chrome 并启用远程调试：

**Windows**：

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**macOS**：

```bash
/Applications/Google\Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222
```

**Linux**：

```bash
google-chrome --remote-debugging-port=9222
```

或使用提供的脚本：

```bash
npm run chrome:start    # 检查 Chrome 状态
npm run chrome:check    # 启动带调试的 Chrome
```

### 安装

1. 安装依赖：

```bash
npm install
```

2. 在开发模式下运行：

```bash
npm run dev
```

这将启动：

- Next.js 开发服务器，地址为 http://localhost:3000
- Electron 窗口

### 构建生产版本

1. 构建应用程序：

```bash
npm run build
```

2. 为您的平台打包：

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 开发

### 类型检查

```bash
npm run typecheck
```

### 代码检查

```bash
npm run lint
```

## 配置

### 环境变量

在根目录创建 `.env` 文件：

```env
# 可选：API 密钥的自定义加密密钥
DESKCLAW_ENCRYPTION_KEY=your-32-byte-hex-key
```

### 数据库

SQLite 数据库存储在：

- Windows: `%APPDATA%/deskclaw/data/deskclaw.db`
- macOS: `~/Library/Application Support/deskclaw/data/deskclaw.db`
- Linux: `~/.config/deskclaw/data/deskclaw.db`

## 架构

### IPC 通信

应用程序使用 Electron 的 IPC 在主进程和渲染进程之间通信：

```typescript
// 渲染进程
const result = await window.electronAPI.providers.list();

// 流式传输
await window.electronAPI.llm.stream(request);
const unsubscribe = window.electronAPI.llm.onStreamChunk(callback);

// 带审批的 shell
await window.electronAPI.shell.execute(command, { requireApproval: true });
```

### 数据库架构

- **providers**：带有加密 API 密钥的 AI 提供商配置
- **models**：每个提供商的可用模型（支持自定义模型）
- **agents**：带有模型绑定的代理配置
- **sessions**：带有消息历史的聊天对话
- **workflows**：带有节点/边 JSON 的工作流定义
- **memories**：代理长期记忆
- **skills**：自定义技能定义
- **scheduled_tasks**：定时工作流执行

### 状态管理

Zustand 用于客户端状态管理：

```typescript
const { currentModel, setCurrentModel, theme, setTheme } = useAppStore();
```

## 贡献

我们欢迎贡献！详情请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

1. Fork 仓库
2. 创建功能分支
3. 进行更改
4. 提交 Pull Request

## 📞 支持

- GitHub Issues: [报告错误或请求功能](https://github.com/Jasper-Leung/deskclaw/issues)
- GitHub Discussions: [社区讨论](https://github.com/Jasper-Leung/deskclaw/discussions)

## 🔒 隐私与安全

- **本地优先**：所有数据默认在本地存储
- **加密 API 密钥**：敏感数据使用 AES-256-GCM 加密
- **无遥测**：无数据收集或跟踪
- **审批门**：危险操作需要用户审批

详细的安全信息请参阅 [SECURITY.md](SECURITY.md)。

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 📜 更新日志

详见 [CHANGELOG.md](CHANGELOG.md) 查看每个版本的更改列表。

## 🙏 致谢

本项目基于优秀的开源软件构建：

### 核心框架

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Next.js](https://nextjs.org/) - React 框架（App Router）
- [React](https://react.dev/) - UI 库
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript

### UI 组件与样式

- [shadcn/ui](https://ui.shadcn.com/) - 基于 Radix UI 构建的精美 UI 组件
- [Radix UI](https://www.radix-ui.com/) - 无样式、可访问的 UI 组件
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS 框架
- [Lucide](https://lucide.dev/) - 精美的图标库
- [Sonner](https://sonner.emilkowal.ski/) - Toast 通知组件

### 数据与状态管理

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Node.js 最快的 SQLite 库
- [Zustand](https://zustand-demo.pmnd.rs/) - 小巧快速的状态管理库
- [Pino](https://getpino.io/) - 快速的 JSON 日志记录器

### AI 与 LLM 集成

- [Vercel AI SDK](https://sdk.vercel.ai/) - 构建 AI 驱动的应用程序
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI 模型上下文标准
- [Anthropic](https://www.anthropic.com/) - AI 服务提供商
- [OpenAI](https://openai.com/) - AI 服务提供商
- [js-tiktoken](https://github.com/dqbd/tiktoken) - GPT 模型的 token 计数工具

### 自动化与浏览器控制

- [Playwright](https://playwright.dev/) - 浏览器自动化
- [@nut-tree/nut-js](https://nutjs.dev/) - 跨平台桌面自动化（Windows、macOS、Linux）
- [chrome-devtools-mcp](https://github.com/modelcontextprotocol/inspect-aurora/tree/main/chrome-devtools-mcp) - Chrome DevTools 集成

### 工作流与可视化

- [React Flow](https://reactflow.dev/) - 工作流编辑器和可视化

### 消息平台

- [@slack/bolt](https://slack.dev/bolt-js/) - Slack 应用框架
- [discord.js](https://discord.js.org/) - Discord API for Node.js
- [grammy](https://grammy.dev/) - Telegram Bot API 框架
- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Bot Builder](https://github.com/microsoft/botbuilder) - Microsoft Bot Framework

### 工具库

- [date-fns](https://date-fns.org/) - 日期操作库
- [clsx](https://github.com/lukeed/clsx) - 条件 className 工具
- [class-variance-authority](https://cva.style/) - 组件变体工具
- [keytar](https://github.com/atom/node-keytar) - 原生凭据存储
- [node-cron](https://www.npmjs.com/package/node-cron) - 任务调度器

### 开发工具

- [Vitest](https://vitest.dev/) - 快速的单元测试框架
- [ESLint](https://eslint.org/) - JavaScript 代码检查工具
- [Prettier](https://prettier.io/) - 代码格式化工具
- [Husky](https://typicode.github.io/husky/) - Git hooks 工具

### 灵感来源

本项目受到本地优先、隐私优先计算运动的启发，旨在将 AI Agent 能力带到桌面环境，同时保持用户对数据的控制权。
