# 🤖 DeskClaw 智能主动推送 - 集成指南

## 📋 集成清单

### ✅ 已创建的文件

| 文件                                               | 说明                              |
| -------------------------------------------------- | --------------------------------- |
| `electron/main/evolution/predictive-engine.ts`     | **预测引擎** - 分析行为并预测需求 |
| `electron/main/ipc/proactive-content-extension.ts` | **IPC 扩展** - 前后端通信         |
| `next/components/evolution/proactive-content.tsx`  | **UI 组件** - 主动推送面板        |
| `docs/PROACTIVE_CONTENT_DELIVERY.md`               | **功能文档** - 完整说明           |

---

## 🚀 快速集成（5 步）

### 步骤 1：注册 IPC 处理器

在 `electron/main/ipc/evolution.ts` 中添加：

```typescript
import { registerProactiveContentHandlers } from './proactive-content-extension.js';

export function registerEvolutionHandlers(): void {
  // ... existing handlers ...

  // Register proactive content handlers
  registerProactiveContentHandlers();
}
```

### 步骤 2：启动学习循环

在 `electron/main/index.ts` 中添加：

```typescript
app.whenReady().then(() => {
  // ... existing code ...

  // Start predictive learning (runs every hour)
  const { getPredictiveEngine } = await import('./evolution/predictive-engine.js');
  const engine = getPredictiveEngine();

  // Initial learning
  engine.generatePredictedTasks();

  // Periodic re-learning
  setInterval(
    () => {
      engine.generatePredictedTasks();
    },
    60 * 60 * 1000
  ); // Every hour
});
```

### 步骤 3：集成到定时任务系统

在 `electron/main/ipc/scheduled.ts` 的执行函数中添加：

```typescript
export async function executeScheduledTask(db: Database, taskId: string): Promise<void> {
  const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(taskId);

  // Check if this is a predictive task
  const predictiveTask = db.prepare('SELECT id FROM predicted_tasks WHERE id = ?').get(taskId);

  if (predictiveTask) {
    // This is an auto-generated proactive task
    const { getPredictiveEngine } = await import('../evolution/predictive-engine.js');
    const engine = getPredictiveEngine();
    await engine.deliverContent(taskId);
    return;
  }

  // ... existing task execution logic ...
}
```

### 步骤 4：在 preload 中暴露 API

```typescript
// electron/preload/index.ts
const evolutionAPI = {
  // ... existing methods ...

  // Proactive content methods
  getPredictedTasks: () => ipcRenderer.invoke('evolution:get-predicted-tasks'),
  getDeliveries: (limit?: number) => ipcRenderer.invoke('evolution:get-deliveries', limit),
  togglePredictedTask: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('evolution:toggle-predicted-task', id, enabled),
  deletePredictedTask: (id: string) => ipcRenderer.invoke('evolution:delete-predicted-task', id),
  provideDeliveryFeedback: (id: string, feedback: 'positive' | 'negative') =>
    ipcRenderer.invoke('evolution:provide-delivery-feedback', id, feedback),
  triggerDelivery: (taskId: string) => ipcRenderer.invoke('evolution:trigger-delivery', taskId),
  generatePredictions: () => ipcRenderer.invoke('evolution:generate-predictions'),
  getLearningInsights: () => ipcRenderer.invoke('evolution:get-learning-insights'),
};
```

### 步骤 5：在页面中使用

在任何页面添加主动推送面板：

```tsx
import { ProactiveContentPanel } from '@/components/evolution/proactive-content';

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 主内容区 */}
      <div className="lg:col-span-2">{/* 你的主要内容 */}</div>

      {/* 侧边栏 */}
      <div className="space-y-4">
        <ProactiveContentPanel />
        {/* 其他侧边栏组件 */}
      </div>
    </div>
  );
}
```

---

## 📊 完整功能流程

```
┌─────────────────────────────────────────────────────────────┐
│                     DeskClaw 启动                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              开始收集使用数据（第1周）                        │
│  • 追踪所有用户交互                                          │
│  • 记录时间戳和上下文                                        │
│  • 构建行为模式库                                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              分析模式并生成预测（第2周）                      │
│  • 检测重复行为序列                                          │
│  • 识别时间偏好                                              │
│  • 预测信息需求                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              创建自动任务并请求确认                           │
│  "我发现你每天早上都查看科技新闻。                            │
│   要不要每天早上9点自动推送摘要？"                           │
│                                                              │
│   [✅ 是的]  [⏸️ 先试一次]  [❌ 不需要]                     │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              用户接受                  用户拒绝
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐       ┌──────────────┐
        │ 创建定时任务       │       │ 记录偏好     │
        │ 配置推送内容       │       │ 降低优先级   │
        │ 开始自动推送       │       │ 继续学习     │
        └───────────────────┘       └──────────────┘
                    │
                    ▼
        ┌───────────────────────────────┐
        │   每天早上9点自动推送内容       │
        │                               │
        │  📰 今日科技新闻摘要：         │
        │  1. AI领域新突破...            │
        │  2. 新框架发布...              │
        │  3. 安全更新...                │
        │                               │
        │  [👍 有用] [👎 没用] [❌ 关闭]  │
        └───────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    👍 正向反馈            👎 负向反馈
        │                       │
        ▼                       ▼
  增加推送频率            减少或停止
  提高置信度              降低置信度
  优化内容生成            记录失败模式
```

---

## 🎯 实际使用示例

### 示例 1：自动新闻摘要

**第1-3天：学习阶段**

```
你: "今天有什么科技新闻？"   (早上 8:50)
你: "最新的 AI 发展如何？"   (早上 9:05)
你: "有什么重要的技术更新？" (早上 9:02)
```

**第4天：预测生成**

```
系统检测到模式：
- 时间偏好：早上 9:00 左右
- 主题：科技新闻、AI 发展
- 频率：每天
- 置信度：0.85 (高)
```

**第5天：首次推送**

```
🔔 DeskClaw 建议

"我注意到你每天早上都查看科技新闻。
 要不要我每天早上 9 点自动推送摘要？"

 [✅ 开始推送]  [⏸️ 先试一次]  [❌ 暂不需要]
```

**第6天及以后：自动推送**

```
📰 每日科技新闻 (早上 9:00)

今日要闻：
• OpenAI 发布 GPT-5 预览版
• React 19 正式发布，带来新的特性
• Linux 内核 6.8 发布，性能提升 15%

[查看详情] [标记有用] [稍后提醒]
```

### 示例 2：自动化工作流

**观察期：**

```
你每周一都运行 "销售数据报告" 工作流
```

**自动生成任务：**

```typescript
{
  name: "周报自动生成",
  cron: "0 9 * * 1",  // 每周一早上9点
  type: "workflow",
  workflowId: "sales-report-workflow"
}
```

**每周一早上自动执行：**

```
✅ 周报已生成并发送到你的收件箱

包含：
• 本周销售数据：$127,430 (+12%)
• 用户增长：+234 新用户
• 热门产品：产品 A (占比 35%)
```

---

## 📈 进化过程

### Week 1-2：数据收集

- ✅ 静默观察，不推送
- ✅ 收集 100+ 使用事件
- ✅ 识别初步模式

### Week 3-4：初步预测

- ✅ 生成首批预测任务
- ✅ 请求用户确认
- ✅ 开始测试推送

### Week 5-8：优化改进

- ✅ 根据反馈调整
- ✅ 提高预测准确率
- ✅ 增加自动化程度

### Week 9+：智能进化

- ✅ 高准确率 (>80%)
- ✅ 用户满意度高
- ✅ 持续学习改进

---

## 🎛️ 高级配置

### 调整学习敏感度

```typescript
// 在 predictive-engine.ts 中
const CONFIG = {
  minOccurrences: 3, // 最少出现次数才算模式
  confidenceThreshold: 0.7, // 最低置信度才推送
  learningInterval: 3600000, // 学习间隔（毫秒）
};
```

### 自定义推送渠道

```typescript
// 添加新的推送渠道
private async sendContent(content: DeliveredContent) {
  switch (content.type) {
    case 'email':
      await this.sendEmail(content);
      break;
    case 'slack':
      await this.sendToSlack(content);
      break;
    case 'webhook':
      await this.sendWebhook(content);
      break;
  }
}
```

### 设置推送规则

```typescript
// 用户可以设置规则
interface DeliveryRules {
  quietHours: {
    start: { hour: 22; minute: 0 }; // 晚上10点后
    end: { hour: 8; minute: 0 }; // 早上8点前
  };
  maxPerDay: 5; // 每天最多5条
  requireConfirmation: true; // 需要用户确认
}
```

---

## 🔒 隐私保护

### 数据本地存储

- ✅ 所有行为数据存储在本地
- ✅ 不发送到任何服务器
- ✅ 用户可随时查看/删除

### 用户完全控制

```tsx
// 完全禁用主动推送
<Switch
  checked={proactiveContentEnabled}
  onCheckedChange={(enabled) => {
    if (!enabled) {
      // 清除所有自动任务
      clearAllPredictedTasks();
    }
  }}
/>
```

### 透明的学习过程

```tsx
// 显示学到的模式
<div>
  <h4>学到的模式</h4>
  <ul>
    <li>📰 每天查看科技新闻</li>
    <li>📊 每周生成销售报告</li>
    <li>🔍 经常搜索行业动态</li>
  </ul>
</div>
```

---

## 📚 相关文档

- [自我进化系统设计](./SELF_EVOLUTION_DESIGN.md)
- [实现指南](./SELF_EVOLUTION_IMPLEMENTATION_GUIDE.md)
- [主动推送功能](./PROACTIVE_CONTENT_DELIVERY.md)

---

这个主动推送功能让 DeskClaw 从"等用户问"进化到"提前想到"！🚀
