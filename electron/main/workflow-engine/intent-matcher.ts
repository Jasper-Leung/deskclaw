interface IntentPattern {
  keywords: string[];
  patterns: RegExp[];
  priority: number; // Higher priority workflows are checked first
}

interface IntentMatch {
  workflowId: string;
  workflowName: string;
  confidence: number;
  extractedParams: Record<string, string>;
}

/**
 * 通用开发工作流意图匹配模式
 * 按照项目开发顺序组织
 */
const WORKFLOW_INTENTS: Record<string, IntentPattern> = {
  // 阶段 1: 项目规划
  'project-planner': {
    keywords: ['规划', 'plan', '需求分析', 'requirements', '技术选型', '设计'],
    patterns: [
      /项目?\s*(?:规划|计划)/i,
      /需求?\s*分析/i,
      /技术?\s*选型/i,
      /如何?\s*开发/i,
      /设计?\s*项目/i,
    ],
    priority: 20,
  },

  // 阶段 2: 项目初始化
  'project-setup': {
    keywords: ['初始化', 'init', 'setup', '创建项目', '新建项目', '开始项目'],
    patterns: [
      /项目?\s*初始化/i,
      /创建?\s*新?\s*项目/i,
      /setup?\s*project/i,
      /init?\s*project/i,
      /项目?\s*搭建/i,
    ],
    priority: 19,
  },

  // 阶段 3: 代码开发
  'code-builder': {
    keywords: ['编写代码', 'generate code', 'write code', '实现功能', '开发功能', '代码实现'],
    patterns: [
      /(?:帮我)?(?:写|编|生成|开发)?\s*代码/i,
      /实现?\s*\w+\s*功能/i,
      /create?\s*\w+\s*(?:function|module|class)/i,
      /build?\s*(?:feature|function|module)/i,
      /(?:写|开发)?\w+\s*(?:代码|功能)/i,
    ],
    priority: 18,
  },

  // 阶段 4: 代码审查
  'code-review': {
    keywords: ['review', '检查代码', '代码审查', 'code review', '检查', '审查'],
    patterns: [
      /review\s+(?:this\s+)?code/i,
      /检查?(?:这段)?代码/i,
      /代码审查/i,
      /code\s+review/i,
      /审查?\s*代码/i,
    ],
    priority: 17,
  },

  // 阶段 5: 测试开发
  'test-generator': {
    keywords: ['单元测试', 'unit test', 'test case', '测试用例', '写测试', 'generate test'],
    patterns: [
      /生成?\s*(?:单元)?测试/i,
      /为.*生成?\s*(?:单元)?测试/i,
      /write\s+test\s+(?:case|for)/i,
      /创建?\s*unit?\s*test/i,
      /写?\s*测试?\s*用例/i,
    ],
    priority: 16,
  },

  // 阶段 6: Bug修复
  'bug-fixer': {
    keywords: ['bug', 'fix', '错误', '问题', 'debug', '调试', '修复', '报错'],
    patterns: [
      /fix\s+(?:this\s+)?bug/i,
      /修复?(?:这个)?bug/i,
      /debug\s+(?:this\s+)?code/i,
      /调试.*代码/i,
      /.*报错/i,
      /.*有问题/i,
      /解决?\s*错误/i,
    ],
    priority: 20,
  },

  // 阶段 7: 文档生成
  'documentation-generator': {
    keywords: ['document', '文档', 'doc', 'generate documentation', '生成文档', 'API文档'],
    patterns: [
      /generat(?:e|ion)\s+documentation/i,
      /生成?(?:API|接口)?文档/i,
      /write\s+docs?\s+for/i,
      /为.*写文档/i,
      /API?\s*文档/i,
    ],
    priority: 15,
  },

  // 阶段 8: 部署发布
  'deploy-helper': {
    keywords: ['deploy', '部署', 'build', '构建', '发布', 'ci/cd', 'docker'],
    patterns: [
      /deploy?\s*project/i,
      /部署?\s*应用/i,
      /build?\s*and?\s*deploy/i,
      /发布?\s*应用/i,
      /docker?\s*部署/i,
      /配置?\s*部署/i,
    ],
    priority: 14,
  },

  // 股市分析
  'stock-market-analyzer': {
    keywords: [
      'stock',
      'stocks',
      '股票',
      '股市',
      '指数',
      'index',
      'indices',
      '行情',
      'quote',
      'quotes',
      '价格',
      'price',
      'market',
      '市场',
      '道琼斯',
      'dow',
      '标普',
      'sp',
      's&p',
      '纳斯达克',
      'nasdaq',
      'aapl',
      'tsla',
      'googl',
      'msft',
      'amzn',
      'nvda',
      'meta',
      '涨跌',
      '涨幅',
      '跌幅',
      '市值',
      '成交',
      '交易',
      'real-time',
      'realtime',
      '实时',
    ],
    patterns: [
      /(?:股票|股市|指数|行情)(?:查询|查看|实时|分析)/i,
      /(?:查看|查询|分析)(?:股票|股市|指数)/i,
      /(?:道琼斯|标普|纳斯达克)(?:指数)?(?:行情|查询|查看)/i,
      /stock\s+(?:market|quote|price|index)/i,
      /(?:check|get|fetch|show)\s+(?:stock|market)/i,
      /real[-\s]?time\s+(?:stock|market|quote)/i,
      /\^?(?:DJI|GSPC|IXIC|RUT|AAPL|TSLA|GOOGL|MSFT|AMZN|NVDA|META)/i,
      /(?:美|中|港)(?:股|股市)/i,
    ],
    priority: 30, // 高优先级
  },

  // 文件操作（保留用于测试）
  'file-io': {
    keywords: ['file', 'read', 'write', '文件', '读写', 'io', 'i/o', '保存文件'],
    patterns: [
      /(?:保存|写入)?\s*文件/i,
      /test?\s*file\s*(?:read\s*write|i\/o|io)/i,
      /read?\s*and?\s*write?\s*file/i,
      /创建?\s*文件?\s*并?\s*保存/i,
    ],
    priority: 13,
  },

  // Claude Code 风格通用开发
  'code-development': {
    keywords: [
      '开发',
      'develop',
      'code',
      '代码',
      '修改',
      'edit',
      '实现',
      'implement',
      '功能',
      'feature',
    ],
    patterns: [
      /(?:帮我)?(?:开发|实现|编写|创建)?\s*\w+\s*功能/i,
      /(?:修改|编辑|更新)?\s*(?:这个)?\s*代码/i,
      /develop?\s*\w+\s*feature/i,
      /implement?\s*\w+/i,
      /read?\s*file?\s*and?\s*(?:modify|edit)/i,
      /(?:读取|分析)(?:这个)?\s*文件/i,
      /(?:帮我)?\s*写\s*代码/i,
      /claude?\s*code/i,
    ],
    priority: 25, // 最高优先级，最通用的开发工作流
  },
};

/**
 * Calculate confidence score for a workflow match
 */
function calculateConfidence(message: string, pattern: IntentPattern): number {
  const lowerMessage = message.toLowerCase();
  let score = 0;
  let maxScore = 0;

  // Keyword matching (40% weight)
  const keywordWeight = 0.4;
  let keywordScore = 0;
  for (const keyword of pattern.keywords) {
    maxScore += keywordWeight;
    if (lowerMessage.includes(keyword.toLowerCase())) {
      keywordScore += keywordWeight;
    }
  }
  score += keywordScore;

  // Pattern matching (60% weight)
  const patternWeight = 0.6;
  let patternScore = 0;
  for (const regex of pattern.patterns) {
    maxScore += patternWeight;
    if (regex.test(message)) {
      patternScore += patternWeight;
      break; // Only count one pattern match
    }
  }
  score += patternScore;

  // Normalize score
  return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
}

/**
 * Extract relevant parameters from user message
 */
function extractParameters(message: string): Record<string, string> {
  const params: Record<string, string> = { raw: message };

  // Extract file paths (Windows and Unix)
  const filePathPatterns = [
    /[A-Za-z]:\\[^:\s"<>|]+[^\s"<>|]/g, // Windows paths
    /\/(?:[^:\s"<>|]+\/)*[^:\s"<>|]+/g, // Unix paths
  ];
  const filePaths: string[] = [];
  for (const pattern of filePathPatterns) {
    const matches = message.match(pattern);
    if (matches) {
      filePaths.push(...matches);
    }
  }
  if (filePaths.length > 0) {
    params.filePaths = filePaths.join(', ');
  }

  // Extract URLs
  const urlPattern = /(https?:\/\/[^\s<>"]+)/g;
  const urls = message.match(urlPattern);
  if (urls) {
    params.urls = urls.join(', ');
  }

  // Extract code snippets (between backticks)
  const codePattern = /```(?:\w+)?\n?([\s\S]*?)```/g;
  const codeMatches = message.match(codePattern);
  if (codeMatches) {
    params.codeSnippets = codeMatches.join('\n---\n');
  }

  // Extract inline code (single backticks)
  const inlineCodePattern = /`([^`\n]+)`/g;
  const inlineMatches = message.match(inlineCodePattern);
  if (inlineMatches) {
    params.inlineCode = inlineMatches.map((m) => m.replace(/`/g, '')).join(', ');
  }

  // Extract stock symbols and indices
  const stockPatterns = [
    // Yahoo Finance format with ^ prefix
    /\^([A-Z]{2,5})/g,
    // Common stock symbols
    /\b(AAPL|TSLA|GOOGL|GOOG|MSFT|AMZN|NVDA|META|BRK\.?A|JPM|V|JNJ|WMT|PG|XOM|UNH|CVX|KO|PEP|TMO|ABBV|COST|AVGO|MRK|LIN|LLY|ABT|DHR|VZ|ADBE|CRM|ORCL|WFC|NFLX|DIS|INTC|AMD|CSCO|HON|PMQ|NKE|BA|TXN|GE|IBM|CAT)\b/gi,
    // Chinese stock market terms
    /(?:道琼斯|dow|道指)/gi,
    /(?:标普|s&p|sp500|sp.*500)/gi,
    /(?:纳斯达克|nasdaq|纳指)/gi,
  ];

  const symbols: string[] = [];
  for (const pattern of stockPatterns) {
    const matches = message.match(pattern);
    if (matches) {
      symbols.push(...matches.map((m) => m.toUpperCase()));
    }
  }
  if (symbols.length > 0) {
    // Map Chinese terms to Yahoo Finance symbols
    const symbolMap: Record<string, string> = {
      道琼斯: '^DJI',
      DOW: '^DJI',
      道指: '^DJI',
      标普: '^GSPC',
      'S&P': '^GSPC',
      SP500: '^GSPC',
      纳斯达克: '^IXIC',
      NASDAQ: '^IXIC',
      纳指: '^IXIC',
    };
    params.stockSymbols = symbols.map((s) => symbolMap[s] || s).join(', ');
    params.stockQuery = 'indices'; // Default to indices query
  }

  return params;
}

/**
 * Match user message against available workflows and return best match
 */
export function matchIntent(
  userMessage: string,
  workflows: Array<{ id: string; name: string; description?: string | null }>
): IntentMatch | null {
  if (!userMessage.trim() || workflows.length === 0) {
    return null;
  }

  const params = extractParameters(userMessage);
  const matches: IntentMatch[] = [];

  // Check each workflow for intent match
  for (const workflow of workflows) {
    let confidence = 0;

    // First, try to match against predefined intents based on workflow name/description
    for (const [intentKey, intentPattern] of Object.entries(WORKFLOW_INTENTS)) {
      const workflowLower =
        workflow.name.toLowerCase() + ' ' + (workflow.description || '').toLowerCase();
      const intentVariations = [
        intentKey,
        intentKey.replace(/-/g, ' '),
        intentKey.replace(/-/g, ''),
      ];

      // Check if workflow matches this intent category
      const matchesIntent = intentVariations.some((variation) => workflowLower.includes(variation));

      if (matchesIntent) {
        confidence = calculateConfidence(userMessage, intentPattern);
        if (confidence > 0.3) {
          // Threshold for minimum confidence
          matches.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            confidence,
            extractedParams: params,
          });
        }
      }
    }

    // Also check workflow name and description directly
    const searchText = `${workflow.name} ${workflow.description || ''}`.toLowerCase();
    const messageLower = userMessage.toLowerCase();

    // Direct keyword match in workflow name/description
    const words = messageLower.split(/\s+/).filter((w) => w.length > 2);
    let wordMatchCount = 0;
    for (const word of words) {
      if (searchText.includes(word)) {
        wordMatchCount++;
      }
    }

    if (wordMatchCount > 0) {
      const wordConfidence = Math.min(wordMatchCount / words.length, 0.8);
      if (wordConfidence > confidence) {
        confidence = wordConfidence;
      }
    }

    if (confidence > 0.3) {
      // Update existing match or add new one
      const existingIndex = matches.findIndex((m) => m.workflowId === workflow.id);
      if (existingIndex >= 0) {
        matches[existingIndex].confidence = Math.max(matches[existingIndex].confidence, confidence);
      } else {
        matches.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          confidence,
          extractedParams: params,
        });
      }
    }
  }

  // Sort by confidence and priority
  matches.sort((a, b) => {
    // First by confidence, then by workflow priority if available
    const aPriority = WORKFLOW_INTENTS[a.workflowName.toLowerCase()]?.priority || 0;
    const bPriority = WORKFLOW_INTENTS[b.workflowName.toLowerCase()]?.priority || 0;

    if (Math.abs(a.confidence - b.confidence) < 0.1) {
      return bPriority - aPriority;
    }
    return b.confidence - a.confidence;
  });

  // Return best match if confidence is above threshold
  const bestMatch = matches[0];
  if (bestMatch && bestMatch.confidence >= 0.35) {
    return bestMatch;
  }

  return null;
}

/**
 * Build a prompt for the workflow based on user message and extracted parameters
 */
export function buildWorkflowPrompt(userMessage: string, params: Record<string, string>): string {
  let prompt = `User Request: ${userMessage}\n\n`;

  if (params.filePaths) {
    prompt += `Files mentioned: ${params.filePaths}\n`;
  }
  if (params.urls) {
    prompt += `URLs mentioned: ${params.urls}\n`;
  }
  if (params.codeSnippets) {
    prompt += `Code snippets provided:\n${params.codeSnippets}\n`;
  }
  if (params.inlineCode) {
    prompt += `Code references: ${params.inlineCode}\n`;
  }

  prompt += `\nPlease fulfill this request using the available tools and capabilities.`;

  return prompt;
}
