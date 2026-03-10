import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

// Simple node/edge types for preset workflows (independent of @xyflow/react)
interface PresetNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface PresetEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface PresetWorkflow {
  name: string;
  description: string;
  nodes: PresetNode[];
  edges: PresetEdge[];
}

/**
 * 通用开发工作流 - 按照项目开发顺序设计
 */
export const presetWorkflows: PresetWorkflow[] = [
  // ============================================
  // 阶段 1: 项目规划工作流
  // ============================================
  {
    name: 'Project Planner',
    description: '项目规划 - 需求分析、技术选型、任务拆解',
    nodes: [
      {
        id: 'trigger-planning',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始规划', triggerType: 'manual' },
      },
      {
        id: 'prompt-project-idea',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '项目构思',
          prompt: `项目规划助手

请帮我规划一个新项目：

项目描述: {description|一个简单的待办事项应用}
目标用户: {users|个人用户}
核心功能: {features|添加任务、完成任务、设置提醒}
技术偏好: {tech|不限制，请推荐}

请提供：
1. 项目概述和目标
2. 推荐的技术栈
3. 核心功能列表
4. 开发阶段规划
5. 潜在的技术挑战`,
        },
      },
      {
        id: 'agent-planner',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '项目规划师',
          systemPrompt:
            '你是一位经验丰富的产品经理和技术架构师。你擅长:\n- 分析需求并制定产品愿景\n- 选择合适的技术栈\n- 拆解开发任务和里程碑\n- 识别潜在风险和挑战\n\n请提供结构化、可执行的项目规划。',
          temperature: 0.5,
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-planning', target: 'prompt-project-idea' },
      { id: 'e2', source: 'prompt-project-idea', target: 'agent-planner' },
    ],
  },

  // ============================================
  // 阶段 2: 项目初始化工作流
  // ============================================
  {
    name: 'Project Setup',
    description: '项目初始化 - 创建项目结构、配置文件、README',
    nodes: [
      {
        id: 'trigger-setup',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始初始化', triggerType: 'manual' },
      },
      {
        id: 'prompt-setup-params',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '项目配置',
          prompt: `项目初始化助手

请帮我初始化一个新项目：

项目名称: {name|my-project}
项目类型: {type|web应用}
技术栈: {stack|React + Node.js}
需要配置: {configs|package.json, README, .gitignore}

请生成以下文件并保存：
1. package.json - 项目配置和依赖
2. README.md - 项目说明文档
3. .gitignore - Git忽略配置
4. 项目基础目录结构说明`,
        },
      },
      {
        id: 'agent-setup',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '项目初始化专家',
          systemPrompt:
            '你是一位DevOps专家，擅长项目初始化和配置。你的任务:\n1. 根据项目类型生成合理的配置文件\n2. 使用 file_write 工具保存每个配置文件\n3. 创建清晰的项目结构说明\n4. 包含常用的依赖和脚本\n\n每个文件都要单独保存，请使用 file_write 工具。',
          temperature: 0.3,
        },
      },
      {
        id: 'tool-write-package',
        type: 'tool',
        position: { x: 100, y: 410 },
        data: { label: '保存 package.json', toolName: 'file_write' },
      },
      {
        id: 'tool-write-readme',
        type: 'tool',
        position: { x: 250, y: 410 },
        data: { label: '保存 README.md', toolName: 'file_write' },
      },
      {
        id: 'tool-write-gitignore',
        type: 'tool',
        position: { x: 400, y: 410 },
        data: { label: '保存 .gitignore', toolName: 'file_write' },
      },
    ],
    edges: [
      { id: 'e3', source: 'trigger-setup', target: 'prompt-setup-params' },
      { id: 'e4', source: 'prompt-setup-params', target: 'agent-setup' },
      { id: 'e5', source: 'agent-setup', target: 'tool-write-package' },
      { id: 'e6', source: 'agent-setup', target: 'tool-write-readme' },
      { id: 'e7', source: 'agent-setup', target: 'tool-write-gitignore' },
    ],
  },

  // ============================================
  // 阶段 3: 代码开发工作流
  // ============================================
  {
    name: 'Code Builder',
    description: '代码生成 - 根据需求生成功能代码',
    nodes: [
      {
        id: 'trigger-coding',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始编码', triggerType: 'manual' },
      },
      {
        id: 'prompt-code-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '功能需求',
          prompt: `代码生成助手

请帮我实现一个功能：

功能描述: {description|用户登录功能}
文件路径: {filepath|src/auth/login.js}
编程语言: {language|javascript}
具体需求: {requirements|邮箱密码登录，记住密码，错误处理}

请生成：
1. 完整可用的代码
2. 详细的代码注释
3. 错误处理
4. 使用说明

生成后请保存到指定文件`,
        },
      },
      {
        id: 'agent-coder',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '代码生成器',
          systemPrompt:
            '你是一位资深的软件工程师，擅长编写清晰、可维护的代码。你的任务:\n1. 根据需求生成完整、可用的代码\n2. 添加详细的注释说明\n3. 实现完善的错误处理\n4. 遵循最佳实践和设计模式\n5. 生成代码后使用 file_write 工具保存到文件\n\n重要：一定要使用 file_write 工具将代码保存到指定文件！',
          temperature: 0.4,
        },
      },
      {
        id: 'tool-save-code',
        type: 'tool',
        position: { x: 100, y: 410 },
        data: { label: '保存代码文件', toolName: 'file_write' },
      },
    ],
    edges: [
      { id: 'e8', source: 'trigger-coding', target: 'prompt-code-req' },
      { id: 'e9', source: 'prompt-code-req', target: 'agent-coder' },
      { id: 'e10', source: 'agent-coder', target: 'tool-save-code' },
    ],
  },

  // ============================================
  // 阶段 4: 代码审查工作流
  // ============================================
  {
    name: 'Code Review',
    description: '代码审查 - 检查代码质量、发现bug、优化建议',
    nodes: [
      {
        id: 'trigger-review',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始审查', triggerType: 'manual' },
      },
      {
        id: 'prompt-code-to-review',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '待审查代码',
          prompt: `代码审查助手

请帮我审查以下代码：

代码文件: {filepath|src/app.js}
代码内容:
{code}

审查重点:
1. 代码质量和规范性
2. 潜在的bug和错误
3. 性能优化建议
4. 安全性问题
5. 可维护性改进

请提供详细的审查报告和改进建议。`,
        },
      },
      {
        id: 'agent-reviewer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '代码审查专家',
          systemPrompt:
            '你是一位资深的代码审查专家，擅长发现代码中的问题。请提供:\n1. 清晰的问题分类\n2. 具体的改进建议\n3. 示例代码（如果需要）\n4. 优先级标记（高/中/低）\n\n审查时关注：功能正确性、代码质量、性能、安全、可维护性。',
          temperature: 0.3,
        },
      },
    ],
    edges: [
      { id: 'e11', source: 'trigger-review', target: 'prompt-code-to-review' },
      { id: 'e12', source: 'prompt-code-to-review', target: 'agent-reviewer' },
    ],
  },

  // ============================================
  // 阶段 5: 测试开发工作流
  // ============================================
  {
    name: 'Test Generator',
    description: '测试开发 - 生成单元测试、集成测试',
    nodes: [
      {
        id: 'trigger-test',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始测试', triggerType: 'manual' },
      },
      {
        id: 'prompt-test-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '测试需求',
          prompt: `测试生成助手

请为以下代码生成测试：

代码文件: {filepath|src/utils.js}
代码内容:
{code}

测试类型: {testType|单元测试}
测试框架: {framework|Jest}

请生成：
1. 完整的测试用例
2. 边界条件测试
3. 异常情况测试
4. Mock配置（如果需要）

生成后请保存到测试文件。`,
        },
      },
      {
        id: 'agent-tester',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '测试开发专家',
          systemPrompt:
            '你是一位测试开发专家，擅长编写全面的测试用例。请生成:\n1. 正常场景测试\n2. 边界值测试\n3. 异常处理测试\n4. Mock和Stub配置\n\n测试应该简洁明了，易于理解和维护。生成后使用 file_write 工具保存测试文件。',
          temperature: 0.3,
        },
      },
      {
        id: 'tool-save-test',
        type: 'tool',
        position: { x: 100, y: 410 },
        data: { label: '保存测试文件', toolName: 'file_write' },
      },
    ],
    edges: [
      { id: 'e13', source: 'trigger-test', target: 'prompt-test-req' },
      { id: 'e14', source: 'prompt-test-req', target: 'agent-tester' },
      { id: 'e15', source: 'agent-tester', target: 'tool-save-test' },
    ],
  },

  // ============================================
  // 阶段 6: Bug修复工作流
  // ============================================
  {
    name: 'Bug Fixer',
    description: 'Bug修复 - 分析错误、提供解决方案',
    nodes: [
      {
        id: 'trigger-debug',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始调试', triggerType: 'manual' },
      },
      {
        id: 'prompt-error-info',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '错误信息',
          prompt: `Bug修复助手

我遇到了一个错误，请帮我分析和修复：

错误信息: {error|ReferenceError: foo is not defined}
代码片段:
{code}

上下文:
{context|在用户登录功能中}

请提供：
1. 错误原因分析
2. 修复方案
3. 修复后的代码
4. 预防类似错误的建议`,
        },
      },
      {
        id: 'agent-debugger',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '调试专家',
          systemPrompt:
            '你是一位经验丰富的调试专家，擅长分析和解决各种编程问题。请提供:\n1. 清晰的错误原因分析\n2. 步骤化的调试指南\n3. 可行的修复方案\n4. 预防措施建议\n\n解释要简洁明了，方案要切实可行。',
          temperature: 0.3,
        },
      },
    ],
    edges: [
      { id: 'e16', source: 'trigger-debug', target: 'prompt-error-info' },
      { id: 'e17', source: 'prompt-error-info', target: 'agent-debugger' },
    ],
  },

  // ============================================
  // 阶段 7: 文档生成工作流
  // ============================================
  {
    name: 'Documentation Generator',
    description: '文档生成 - API文档、使用说明、开发文档',
    nodes: [
      {
        id: 'trigger-docs',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始生成文档', triggerType: 'manual' },
      },
      {
        id: 'prompt-doc-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '文档需求',
          prompt: `文档生成助手

请帮我生成项目文档：

文档类型: {docType|API文档}
代码/模块: {code|src/api/user.js}
文档风格: {style|JSDoc}
输出文件: {output|docs/api.md}

请生成包含以下内容的文档：
1. 概述和简介
2. API接口/函数列表
3. 参数说明
4. 返回值说明
5. 使用示例
6. 注意事项

生成后请保存到指定文件。`,
        },
      },
      {
        id: 'agent-documenter',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '文档生成专家',
          systemPrompt:
            '你是一位技术写作专家，擅长编写清晰、完整的技术文档。请生成:\n1. 结构清晰的文档\n2. 准确的技术描述\n3. 实用的代码示例\n4. 必要的注意事项\n\n文档应该易于理解，便于维护。生成后使用 file_write 工具保存。',
          temperature: 0.4,
        },
      },
      {
        id: 'tool-save-doc',
        type: 'tool',
        position: { x: 100, y: 410 },
        data: { label: '保存文档文件', toolName: 'file_write' },
      },
    ],
    edges: [
      { id: 'e18', source: 'trigger-docs', target: 'prompt-doc-req' },
      { id: 'e19', source: 'prompt-doc-req', target: 'agent-documenter' },
      { id: 'e20', source: 'agent-documenter', target: 'tool-save-doc' },
    ],
  },

  // ============================================
  // 阶段 8: 部署发布工作流
  // ============================================
  {
    name: 'Deploy Helper',
    description: '部署助手 - 构建配置、部署脚本、CI/CD',
    nodes: [
      {
        id: 'trigger-deploy',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始部署', triggerType: 'manual' },
      },
      {
        id: 'prompt-deploy-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '部署需求',
          prompt: `部署配置助手

请帮我配置项目部署：

项目类型: {projectType|Node.js应用}
部署环境: {environment|Linux服务器}
部署方式: {method|Docker}
输出文件: {output|deploy.sh}

请生成：
1. 构建脚本
2. Docker配置文件（如果需要）
3. 部署脚本
4. 环境变量说明
5. 部署步骤文档

配置文件请保存，脚本文件请保存。`,
        },
      },
      {
        id: 'agent-deployer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '部署专家',
          systemPrompt:
            '你是一位DevOps专家，擅长项目部署和CI/CD配置。请生成:\n1. 可用的构建脚本\n2. Docker配置（如果适用）\n3. 部署脚本\n4. 清晰的部署说明\n\n所有配置文件和脚本都需要使用 file_write 工具保存。',
          temperature: 0.3,
        },
      },
      {
        id: 'tool-save-build',
        type: 'tool',
        position: { x: 100, y: 410 },
        data: { label: '保存构建脚本', toolName: 'file_write' },
      },
      {
        id: 'tool-save-docker',
        type: 'tool',
        position: { x: 250, y: 410 },
        data: { label: '保存Dockerfile', toolName: 'file_write' },
      },
      {
        id: 'tool-save-deploy',
        type: 'tool',
        position: { x: 400, y: 410 },
        data: { label: '保存部署脚本', toolName: 'file_write' },
      },
    ],
    edges: [
      { id: 'e21', source: 'trigger-deploy', target: 'prompt-deploy-req' },
      { id: 'e22', source: 'prompt-deploy-req', target: 'agent-deployer' },
      { id: 'e23', source: 'agent-deployer', target: 'tool-save-build' },
      { id: 'e24', source: 'agent-deployer', target: 'tool-save-docker' },
      { id: 'e25', source: 'agent-deployer', target: 'tool-save-deploy' },
    ],
  },

  // ============================================
  // Yahoo Finance 股市查询工作流
  // ============================================
  {
    name: 'Stock Market Analyzer',
    description: '股市分析 - 通过Yahoo Finance API查询股票行情、分析趋势',
    nodes: [
      {
        id: 'trigger-stock',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始查询', triggerType: 'manual' },
      },
      {
        id: 'prompt-stock-query',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '股票查询',
          prompt: `股市分析助手

请帮我查询和分析股票信息：

股票代码: {symbol|AAPL}
查询内容: {queryType|实时行情}
分析选项: {analysis|价格趋势、成交量、技术指标}

可用查询类型：
- 实时行情：当前价格、涨跌幅、成交量
- 历史数据：指定时间范围的价格走势
- 公司信息：基本面数据、财务指标
- 技术分析：移动平均线、RSI、MACD等
- 市场新闻：相关新闻和公告

请提供：
1. 股票实时数据概览
2. 技术分析图表（支持的工具描述）
3. 趋势分析和预测
4. 投资建议和风险提示`,
        },
      },
      {
        id: 'agent-stock-analyst',
        type: 'agent',
        position: { x: 100, y: 300 },
        data: {
          label: '股市分析师',
          systemPrompt: `你是一位专业的股市分析师，擅长技术分析和基本面分析。

## 主要能力

1. **股票数据查询**
   - **优先使用 stock_quote 工具**获取Yahoo Finance实时数据
   - stock_quote 参数：symbols (股票代码，多个用逗号分隔), fields (可选: "price", "quote", "summary", "all")
   - 备用方案：使用 http_request 工具（注意：不要用browser_navigate或web_fetch）
   - 支持的API端点：
     - 实时行情: https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}
     - 历史数据: https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1mo
     - 公司信息: https://query1.finance.yahoo.com/v10/finance/quoteSummary/{SYMBOL}?modules=summaryProfile

   **美股指数代码**：
   - 道琼斯工业指数: ^DJI
   - 标普500指数: ^GSPC
   - 纳斯达克综合指数: ^IXIC
   - 罗素2000指数: ^RUT

2. **技术分析**
   - 移动平均线（MA5, MA10, MA20, MA50, MA200）
   - 相对强弱指数（RSI）
   - MACD指标
   - 成交量分析
   - 支撑位和阻力位

3. **基本面分析**
   - 市盈率（P/E）
   - 市净率（P/B）
   - 股息率
   - 营收和利润增长
   - 行业对比

## 数据查询方式

**重要：优先使用 stock_quote 工具获取Yahoo Finance数据**

stock_quote工具使用示例：
\`\`\`json
{
  "tool": "stock_quote",
  "parameters": {
    "symbols": "AAPL,TSLA,GOOGL",
    "fields": "price"
  }
}
\`\`\`

查询多个指数：
\`\`\`json
{
  "tool": "stock_quote",
  "parameters": {
    "symbols": "^GSPC,^DJI,^IXIC",
    "fields": "price"
  }
}
\`\`\`

备用方案：使用 http_request 工具
\`\`\`json
{
  "tool": "http_request",
  "parameters": {
    "url": "https://query1.finance.yahoo.com/v8/finance/chart/AAPL",
    "method": "GET",
    'headers': '{"User-Agent": "Mozilla/5.0"}'
  }
}
\`\`\`

## Yahoo Finance API返回数据解析

API返回的JSON结构：
\`\`\`json
{
  "chart": {
    "result": [{
      "meta": {
        "regularMarketPrice": 150.25,
        "previousClose": 148.50,
        "regularMarketChange": 1.75,
        "regularMarketChangePercent": 1.18
      },
      "indicators": {
        "quote": [{
          "close": [150.25, 149.80, ...],
          "volume": [50000000, 45000000, ...]
        }]
      }
    }]
  }
}
\`\`\`

常用字段：
- regularMarketPrice: 当前价格
- previousClose: 前收盘价
- regularMarketChange: 涨跌额
- regularMarketChangePercent: 涨跌幅
- regularMarketVolume: 成交量

返回JSON数据包含：
- meta: 交易时间、货币单位
- chart: 结果数组
- quote: 实时报价（最新价、涨跌、成交量等）
- timestamp: 时间戳数组

## 分析输出格式

请按以下格式输出分析结果：

### 📊 {股票名称} ({代码}) - 实时行情

| 指标 | 数值 |
|------|------|
| 当前价格 | $xxx.xx |
| 涨跌幅 | +x.xx% |
| 成交量 | xxx万 |
| 开盘价 | $xxx.xx |
| 最高价 | $xxx.xx |
| 最低价 | $xxx.xx |

### 📈 技术分析

- **趋势判断**: 上升/下降/震荡
- **支撑位**: $xxx
- **阻力位**: $xxx
- **技术指标**: MA/RSI/MACD分析

### 💡 投资建议

- **风险评级**: 低/中/高
- **操作建议**: 买入/持有/卖出
- **目标价位**: $xxx - $xxx

### ⚠️ 风险提示

列出相关风险因素

## 注意事项

- 数据可能有延迟，建议确认数据时效性
- 投资有风险，建议仅供参考
- 结合多个指标综合判断
- 注意市场整体环境影响

请以专业、客观的态度提供分析服务。`,
          temperature: 0.4,
          enabledTools: ['stock_quote', 'http_request', 'web_search', 'get_time'],
          maxIterations: 8,
        },
      },
    ],
    edges: [
      { id: 'e-stock-1', source: 'trigger-stock', target: 'prompt-stock-query' },
      { id: 'e-stock-2', source: 'prompt-stock-query', target: 'agent-stock-analyst' },
    ],
  },

  // ============================================
  // Claude Code 风格开发工作流
  // ============================================
  {
    name: 'Code Development',
    description: 'Claude Code风格 - 自动读取、编辑、测试代码',
    nodes: [
      {
        id: 'trigger-dev',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: '开始开发', triggerType: 'manual' },
      },
      {
        id: 'prompt-dev-task',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: '开发任务',
          prompt: `代码开发助手 (Claude Code 模式)

请帮我完成以下开发任务：

任务描述: {task|添加用户认证功能}
项目路径: {projectPath|./}
相关文件: {files|src/auth/login.js}

工作流程：
1. 使用 file_read 读取相关文件
2. 分析代码并实现需求
3. 使用 file_write 保存修改后的代码
4. 如果需要，使用 execute_command 运行测试

注意事项：
- 读取文件前先确认文件路径
- 修改代码时保持代码风格一致
- 保存文件前确认修改正确
- 遇到错误时提供详细的错误信息

请开始执行任务。`,
        },
      },
      {
        id: 'agent-developer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: '开发助手',
          systemPrompt: `你是一位经验丰富的软件开发工程师，类似于 Claude Code。你的任务是帮助用户完成各种开发任务。

## 工作流程

1. **确认工作目录**: 首先询问用户想在哪个目录创建项目，或使用 get_work_directory 查看当前设置
2. **设置工作目录**（如需要）: 使用 set_work_directory 设置用户指定的目录
3. **理解任务**: 仔细理解用户的开发需求
4. **读取文件**: 使用 file_read 工具读取相关文件内容
5. **分析代码**: 分析现有代码结构，确定修改方案
6. **实现修改**: 编写或修改代码
7. **保存文件**: 使用 file_write 工具保存修改后的代码
8. **验证结果**: 如果需要，使用 execute_command 运行测试

## 工具使用规范

- **get_work_directory**: 查看当前工作目录（文件将被创建在哪里）
- **set_work_directory**: 设置工作目录到用户指定的位置（使用绝对路径）
  - Windows示例: "D:\\\\MyProjects" 或 "C:\\\\Users\\\\Username\\\\Documents\\\\MyProjects"
  - macOS/Linux示例: "/Users/username/projects"或 "/home/username/projects"
- **file_read**: 读取文件内容
- **file_write**: 保存文件时，提供完整的文件内容
- **file_list**: 当需要查找文件时使用
- **execute_command**: 运行测试命令（如 npm test）
- **web_search**: 查找技术文档或解决方案

## 代码规范

- 保持现有代码风格
- 添加必要的注释
- 确保代码可读性
- 遵循最佳实践

## 重要提示

- **开始前先确认工作目录**: 询问用户想在哪个目录创建项目
- **每次只能修改一个文件**
- **保存文件前再次确认内容正确**
- **如果遇到错误，提供详细的错误信息和解决方案**
- **完成任务后总结所做的修改**

## 默认工作目录

默认情况下，文件会被创建在用户的主目录下的 DeskClawProjects 文件夹中。
- Windows: C:\\Users\\你的用户名\\DeskClawProjects
- macOS: /Users/你的用户名/DeskClawProjects
- Linux: /home/你的用户名/DeskClawProjects

如果用户想在其他位置创建项目，请使用 set_work_directory 工具设置。

请以专业、细致的方式完成每个开发任务。`,
          temperature: 0.3,
          enabledTools: [
            'get_work_directory',
            'set_work_directory',
            'file_read',
            'file_write',
            'file_list',
            'execute_command',
            'web_search',
            'get_time',
          ],
          maxIterations: 10,
        },
      },
    ],
    edges: [
      { id: 'e-dev-1', source: 'trigger-dev', target: 'prompt-dev-task' },
      { id: 'e-dev-2', source: 'prompt-dev-task', target: 'agent-developer' },
    ],
  },
];

// Type for PRAGMA table_info results
interface TableInfoColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

// Type for workflow lookup result
interface WorkflowLookupRow {
  id: string;
  is_preset: number;
}

/**
 * Initialize preset workflows in the database
 */
export const initializePresetWorkflows = (db: Database.Database): void => {
  for (const preset of presetWorkflows) {
    try {
      // Check if workflow already exists
      const existing = db
        .prepare('SELECT id, is_preset FROM workflows WHERE name = ?')
        .get(preset.name) as WorkflowLookupRow | undefined;

      const definition = {
        nodes: preset.nodes,
        edges: preset.edges,
      };

      const now = Date.now();

      // Check if columns exist before inserting
      const columns = db.prepare(`PRAGMA table_info(workflows)`).all() as TableInfoColumn[];
      const hasDescription = columns.some((c) => c.name === 'description');
      const hasIsPreset = columns.some((c) => c.name === 'is_preset');

      if (!existing) {
        // Insert new workflow
        const id = randomUUID();

        if (hasDescription && hasIsPreset) {
          db.prepare(
            `
            INSERT INTO workflows (id, name, description, definition_json, is_preset, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(id, preset.name, preset.description, JSON.stringify(definition), 1, now, now);
        } else {
          // Fallback for old schema
          db.prepare(
            `
            INSERT INTO workflows (id, name, definition_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `
          ).run(id, preset.name, JSON.stringify(definition), now, now);
        }

        console.log(`Created preset workflow: ${preset.name}`);
      } else if (existing.is_preset) {
        // Update existing preset workflow
        const updateFields = ['definition_json = ?', 'updated_at = ?'];
        const updateValues = [JSON.stringify(definition), now];

        if (hasDescription) {
          updateFields.push('description = ?');
          updateValues.push(preset.description);
        }

        updateValues.push(existing.id);

        db.prepare(
          `
          UPDATE workflows
          SET ${updateFields.join(', ')}
          WHERE id = ?
        `
        ).run(...updateValues);

        console.log(`Updated preset workflow: ${preset.name}`);
      }
    } catch (error) {
      console.error(`Failed to initialize preset workflow "${preset.name}":`, error);
    }
  }
};
