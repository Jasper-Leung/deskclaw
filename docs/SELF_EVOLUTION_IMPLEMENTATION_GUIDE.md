# DeskClaw 自我进化功能实现指南

## 📋 实现清单

### ✅ 已完成的核心组件

| 组件       | 文件路径                                          | 说明               |
| ---------- | ------------------------------------------------- | ------------------ |
| 设计文档   | `docs/SELF_EVOLUTION_DESIGN.md`                   | 完整的系统设计     |
| 分析引擎   | `electron/main/evolution/analytics.ts`            | 使用数据收集和分析 |
| IPC 处理器 | `electron/main/ipc/evolution.ts`                  | 前后端通信         |
| UI 组件    | `next/components/evolution/smart-suggestions.tsx` | 建议显示面板       |

---

## 🚀 快速开始

### 1. 注册 IPC 处理器

在 `electron/main/index.ts` 中添加：

```typescript
import { registerEvolutionHandlers } from './ipc/evolution.js';

app.whenReady().then(() => {
  // ... existing code ...

  // Register evolution handlers
  registerEvolutionHandlers();
});
```

### 2. 在 preload 中暴露 API

在 `electron/preload/index.ts` 中添加：

```typescript
import { ipcRenderer } from 'electron';

const evolutionAPI = {
  getSuggestions: () => ipcRenderer.invoke('evolution:get-suggestions'),
  dismissSuggestion: (id: string) => ipcRenderer.invoke('evolution:dismiss-suggestion', id),
  applySuggestion: (id: string, actions: any) =>
    ipcRenderer.invoke('evolution:apply-suggestion', id, actions),
  trackEvent: (type: string, context: Record<string, unknown>) =>
    ipcRenderer.invoke('evolution:track-event', type, context),
  getMetrics: () => ipcRenderer.invoke('evolution:get-metrics'),
};

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing APIs ...
  evolution: evolutionAPI,
});
```

### 3. 添加 TypeScript 类型定义

在 `shared/types/index.ts` 中添加：

```typescript
export interface ElectronAPI {
  evolution: {
    getSuggestions: () => Promise<EvolutionSuggestion[]>;
    dismissSuggestion: (id: string) => Promise<{ success: boolean }>;
    applySuggestion: (id: string, actions: SuggestedAction[]) => Promise<{ success: boolean }>;
    trackEvent: (type: string, context: Record<string, unknown>) => Promise<{ success: boolean }>;
    getMetrics: () => Promise<EvolutionMetrics | null>;
  };
}
```

### 4. 在页面中使用建议面板

在任何页面中添加：

```tsx
import { SmartSuggestions } from '@/components/evolution/smart-suggestions';

export default function YourPage() {
  return (
    <div>
      {/* 你的页面内容 */}
      <SmartSuggestions />
    </div>
  );
}
```

### 5. 追踪用户行为

在需要追踪的地方添加：

```tsx
// 追踪按钮点击
const handleClick = () => {
  window.electronAPI.evolution.trackEvent('click', {
    elementId: 'save-button',
    elementType: 'button',
  });
  // ... 你的逻辑
};

// 追踪工作流执行
const handleWorkflowExecute = async (workflowId: string) => {
  const startTime = Date.now();
  try {
    await executeWorkflow(workflowId);
    window.electronAPI.evolution.trackEvent('workflow_execution', {
      workflowId,
      success: true,
      executionTime: Date.now() - startTime,
    });
  } catch (error) {
    window.electronAPI.evolution.trackEvent('workflow_execution', {
      workflowId,
      success: false,
      errorMessage: String(error),
    });
  }
};
```

---

## 🔧 集成点

### 1. 页面追踪

在每个页面的 `layout.tsx` 中添加：

```tsx
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // 追踪页面浏览
    window.electronAPI?.evolution?.trackEvent('page_view', {
      page: pathname,
    });

    const startTime = Date.now();

    return () => {
      // 追踪页面停留时间
      const duration = Date.now() - startTime;
      window.electronAPI?.evolution?.trackEvent('page_view', {
        page: pathname,
        duration,
      });
    };
  }, [pathname]);

  return <>{children}</>;
}
```

### 2. 工作流追踪

在 `electron/main/ipc/workflows.ts` 的 `executeWorkflow` 函数中添加：

```typescript
import { getEvolutionAnalytics } from '../evolution/analytics.js';

export async function executeWorkflow(
  db: Database,
  workflowId: string
  // ... other params
) {
  const analytics = getEvolutionAnalytics();
  const startTime = Date.now();
  let success = false;

  try {
    // ... existing workflow execution logic ...
    success = true;
    return result;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    // 追踪工作流执行
    const workflow = getWorkflow(db, workflowId);
    analytics.trackWorkflowExecution(workflowId, workflow.name, Date.now() - startTime, success);
  }
}
```

### 3. 聊天追踪

在 `electron/main/ipc/llm.ts` 中添加：

```typescript
import { getEvolutionAnalytics } from '../evolution/analytics.js';

export async function handleChatMessage(
  db: Database,
  agentId: string,
  modelId: string,
  message: string
) {
  const analytics = getEvolutionAnalytics();

  // 追踪用户消息
  analytics.trackChatMessage(agentId, modelId, message.length, true);

  // ... existing chat logic ...
}
```

### 4. 错误追踪

在全局错误处理器中添加：

```typescript
// electron/main/lib/error-handler.ts
import { getEvolutionAnalytics } from '../evolution/analytics.js';

export function handleError(error: Error, options: ErrorHandlerOptions = {}) {
  const analytics = getEvolutionAnalytics();

  // 追踪错误
  analytics.trackError(error.name, error.message, {
    category: getAppErrorCategory(error),
    severity: getAppErrorSeverity(error),
  });

  // ... existing error handling logic ...
}
```

---

## 📊 数据库表结构

```sql
-- 追踪使用事件
CREATE TABLE IF NOT EXISTS evolution_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  context_json TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

-- 存储学习到的模式
CREATE TABLE IF NOT EXISTS evolution_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  pattern_data TEXT NOT NULL,
  confidence REAL DEFAULT 0.0,
  usage_count INTEGER DEFAULT 0,
  last_success INTEGER,
  last_failure INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 存储进化建议
CREATE TABLE IF NOT EXISTS evolution_suggestions (
  id TEXT PRIMARY KEY,
  suggestion_type TEXT NOT NULL,
  suggestion_data TEXT NOT NULL,
  priority REAL DEFAULT 0.5,
  status TEXT DEFAULT 'pending',
  user_feedback INTEGER,
  created_at INTEGER NOT NULL
);

-- 性能指标历史
CREATE TABLE IF NOT EXISTS evolution_metrics (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  context_json TEXT,
  timestamp INTEGER NOT NULL
);
```

---

## 🎯 下一步功能

### 短期（1-2 周）

1. **基础数据收集**
   - ✅ 事件追踪系统
   - ✅ 模式分析引擎
   - ✅ 建议生成器
   - ⏳ 数据库持久化

2. **智能建议**
   - ⏳ 工作流优化建议
   - ⏳ 快捷方式推荐
   - ⏳ 使用统计面板

### 中期（3-4 周）

3. **自动工作流生成**
   - ⏳ 自然语言意图解析
   - ⏳ 工作流模板生成
   - ⏳ 自动验证和测试

4. **性能优化**
   - ⏳ 瓶颈检测
   - ⏳ 自动参数调优
   - ⏳ 性能报告

### 长期（1-2 月）

5. **知识库构建**
   - ⏳ 从对话中学习
   - ⏳ 语义搜索
   - ⏳ 知识图谱

6. **反馈循环**
   - ⏳ 用户反馈收集
   - ⏳ A/B 测试框架
   - ⏳ 自动改进

---

## 🔒 隐私和安全

1. **本地存储**
   - 所有进化数据存储在本地 SQLite
   - 不发送到任何服务器

2. **用户控制**

   ```tsx
   // 设置页面添加开关
   <Switch checked={evolutionEnabled} onCheckedChange={setEvolutionEnabled} />
   ```

3. **数据透明化**

   ```tsx
   // 显示收集的数据
   <button onClick={showCollectedData}>查看我的使用数据</button>
   ```

4. **数据删除**
   ```typescript
   // 清除所有进化数据
   export async function clearEvolutionData(): Promise<void> {
     const db = getDatabase();
     db.prepare('DELETE FROM evolution_events').run();
     db.prepare('DELETE FROM evolution_patterns').run();
     db.prepare('DELETE FROM evolution_suggestions').run();
   }
   ```

---

## 📈 监控指标

### 进化健康度

```typescript
interface EvolutionHealth {
  // 数据收集
  eventsPerDay: number;
  uniquePatterns: number;

  // 学习效果
  suggestionsGenerated: number;
  suggestionsAccepted: number;
  acceptanceRate: number;

  // 性能影响
  avgResponseTime: number;
  storageUsed: number;
  cpuOverhead: number;
}
```

### 每日报告

```typescript
interface DailyEvolutionReport {
  date: string;
  newPatternsLearned: number;
  suggestionsMade: number;
  userAdoptions: number;
  performanceImpact: number;
}
```

---

## 🎨 UI/UX 考虑

1. **非侵入式设计**
   - 建议面板可折叠
   - 不阻断用户操作
   - 可随时关闭

2. **透明度**
   - 显示建议的依据
   - 可查看学习到的模式
   - 解释置信度

3. **用户控制**
   - 可禁用特定类型建议
   - 可调整建议频率
   - 可查看和删除数据

---

这个实现指南提供了完整的集成路径。你想从哪个部分开始？
