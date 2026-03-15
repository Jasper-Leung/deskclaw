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
 * General Development Workflows - Designed in project development order
 */
export const presetWorkflows: PresetWorkflow[] = [
  // ============================================
  // Phase 1: Project Planning Workflow
  // ============================================
  {
    name: 'Project Planner',
    description: 'Project Planning - Requirements analysis, technology selection, task breakdown',
    nodes: [
      {
        id: 'trigger-planning',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Planning', triggerType: 'manual' },
      },
      {
        id: 'prompt-project-idea',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Project Idea',
          prompt: `Project Planning Assistant

Please help me plan a new project:

Project Description: {description|A simple todo application}
Target Users: {users|Individual users}
Core Features: {features|Add tasks, complete tasks, set reminders}
Technology Preference: {tech|No restrictions, please recommend}

Please provide:
1. Project overview and goals
2. Recommended technology stack
3. Core feature list
4. Development phase planning
5. Potential technical challenges`,
        },
      },
      {
        id: 'agent-planner',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Project Planner',
          systemPrompt:
            'You are an experienced product manager and technical architect. You excel at:\n- Analyzing requirements and defining product vision\n- Selecting appropriate technology stacks\n- Breaking down development tasks and milestones\n- Identifying potential risks and challenges\n\nPlease provide structured, actionable project planning.',
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
  // Phase 2: Project Initialization Workflow
  // ============================================
  {
    name: 'Project Setup',
    description: 'Project Initialization - Create project structure, configuration files, README',
    nodes: [
      {
        id: 'trigger-setup',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Initialization', triggerType: 'manual' },
      },
      {
        id: 'prompt-setup-params',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Project Configuration',
          prompt: `Project Initialization Assistant

Please help me initialize a new project:

Project Name: {name|my-project}
Project Type: {type|Web application}
Technology Stack: {stack|React + Node.js}
Required Configurations: {configs|package.json, README, .gitignore}

Please generate and save the following files:
1. package.json - Project configuration and dependencies
2. README.md - Project documentation
3. .gitignore - Git ignore configuration
4. Basic project directory structure description`,
        },
      },
      {
        id: 'agent-setup',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Project Initialization Expert',
          modelId: 'default',
          systemPrompt:
            'You are a DevOps expert specializing in project initialization and configuration. ' +
            'Your tasks:\n' +
            '1. Generate appropriate configuration files based on project type\n' +
            '2. Create clear project structure documentation\n' +
            '3. Include common dependencies and scripts\n' +
            '4. IMPORTANT: You MUST use the file_write tool to save each configuration file\n' +
            '\n' +
            'Files to generate based on user requirements:\n' +
            '- package.json: Project configuration and dependencies\n' +
            '- README.md: Project documentation\n' +
            '- .gitignore: Git ignore configuration\n' +
            '\n' +
            'Use the file_write tool with these parameters:\n' +
            '- filepath: the file path (e.g., "package.json")\n' +
            '- content: the file content\n' +
            '\n' +
            'Each file must be saved separately using the file_write tool.',
          temperature: 0.3,
          enabledTools: ['file_write'],
          maxIterations: 8,
        },
      },
    ],
    edges: [
      { id: 'e3', source: 'trigger-setup', target: 'prompt-setup-params' },
      { id: 'e4', source: 'prompt-setup-params', target: 'agent-setup' },
    ],
  },

  // ============================================
  // Phase 3: Code Development Workflow
  // ============================================
  {
    name: 'Code Builder',
    description: 'Code Generation - Generate functional code based on requirements',
    nodes: [
      {
        id: 'trigger-coding',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Coding', triggerType: 'manual' },
      },
      {
        id: 'prompt-code-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Feature Requirements',
          prompt: `Code Generation Assistant

Please help me implement a feature:

Feature Description: {description|User login functionality}
File Path: {filepath|src/auth/login.js}
Programming Language: {language|javascript}
Specific Requirements: {requirements|Email/password login, remember password, error handling}

Please generate:
1. Complete, usable code
2. Detailed code comments
3. Error handling
4. Usage instructions

Please save to the specified file after generation`,
        },
      },
      {
        id: 'agent-coder',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Code Generator',
          modelId: 'default',
          systemPrompt:
            'You are a senior software engineer specializing in writing clear, maintainable code. ' +
            'Your tasks:\n' +
            '1. Generate complete, usable code based on requirements\n' +
            '2. Add detailed comments\n' +
            '3. Implement comprehensive error handling\n' +
            '4. Follow best practices and design patterns\n' +
            '5. IMPORTANT: You MUST use the file_write tool to save code to file after generation\n' +
            '\n' +
            'The user will specify a file path (e.g., "src/auth/login.js"). Use that exact path for the filepath parameter.\n' +
            'Use the file_write tool with these parameters:\n' +
            '- filepath: the file path specified by the user\n' +
            '- content: the generated code\n' +
            '\n' +
            'Example tool call:\n' +
            '{"tool": "file_write", "parameters": {"filepath": "src/auth/login.js", "content": "..."}}',
          temperature: 0.4,
          enabledTools: ['file_write'],
          maxIterations: 5,
        },
      },
    ],
    edges: [
      { id: 'e8', source: 'trigger-coding', target: 'prompt-code-req' },
      { id: 'e9', source: 'prompt-code-req', target: 'agent-coder' },
    ],
  },

  // ============================================
  // Phase 4: Code Review Workflow
  // ============================================
  {
    name: 'Code Review',
    description: 'Code Review - Check code quality, find bugs, optimization suggestions',
    nodes: [
      {
        id: 'trigger-review',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Review', triggerType: 'manual' },
      },
      {
        id: 'prompt-code-to-review',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Code to Review',
          prompt: `Code Review Assistant

Please help me review the following code:

Code File: {filepath|src/app.js}
Code Content:
{code}

Review Focus:
1. Code quality and standards
2. Potential bugs and errors
3. Performance optimization suggestions
4. Security issues
5. Maintainability improvements

Please provide detailed review report and improvement suggestions.`,
        },
      },
      {
        id: 'agent-reviewer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Code Review Expert',
          systemPrompt:
            'You are a senior code review expert specializing in identifying issues in code. Please provide:\n1. Clear issue classification\n2. Specific improvement suggestions\n3. Example code (if needed)\n4. Priority markers (High/Medium/Low)\n\nFocus on: functional correctness, code quality, performance, security, maintainability.',
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
  // Phase 5: Test Development Workflow
  // ============================================
  {
    name: 'Test Generator',
    description: 'Test Development - Generate unit tests, integration tests',
    nodes: [
      {
        id: 'trigger-test',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Testing', triggerType: 'manual' },
      },
      {
        id: 'prompt-test-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Test Requirements',
          prompt: `Test Generation Assistant

Please generate tests for the following code:

Code File: {filepath|src/utils.js}
Code Content:
{code}

Test Type: {testType|Unit test}
Test Framework: {framework|Jest}

Please generate:
1. Complete test cases
2. Boundary condition tests
3. Exception handling tests
4. Mock configuration (if needed)

Please save to test file after generation.`,
        },
      },
      {
        id: 'agent-tester',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Test Development Expert',
          modelId: 'default',
          systemPrompt:
            'You are a test development expert specializing in writing comprehensive test cases. ' +
            'Please generate:\n' +
            '1. Normal scenario tests\n' +
            '2. Boundary value tests\n' +
            '3. Exception handling tests\n' +
            '4. Mock and Stub configuration\n' +
            '\n' +
            'IMPORTANT: You MUST use the file_write tool to save test files after generation.\n' +
            'Tests should be concise, clear, easy to understand and maintain.\n' +
            '\n' +
            'The user will specify a test file path (e.g., "src/utils.test.js"). Use that exact path for the filepath parameter.\n' +
            'Use the file_write tool with these parameters:\n' +
            '- filepath: the test file path specified by the user\n' +
            '- content: the generated test code',
          temperature: 0.3,
          enabledTools: ['file_write'],
          maxIterations: 5,
        },
      },
    ],
    edges: [
      { id: 'e13', source: 'trigger-test', target: 'prompt-test-req' },
      { id: 'e14', source: 'prompt-test-req', target: 'agent-tester' },
    ],
  },

  // ============================================
  // Phase 6: Bug Fix Workflow
  // ============================================
  {
    name: 'Bug Fixer',
    description: 'Bug Fix - Analyze errors, provide solutions',
    nodes: [
      {
        id: 'trigger-debug',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Debugging', triggerType: 'manual' },
      },
      {
        id: 'prompt-error-info',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Error Information',
          prompt: `Bug Fix Assistant

I encountered an error, please help me analyze and fix it:

Error Message: {error|ReferenceError: foo is not defined}
Code Snippet:
{code}

Context:
{context|In user login functionality}

Please provide:
1. Error cause analysis
2. Fix solution
3. Fixed code
4. Suggestions to prevent similar errors`,
        },
      },
      {
        id: 'agent-debugger',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Debugging Expert',
          systemPrompt:
            'You are an experienced debugging expert specializing in analyzing and resolving various programming issues. Please provide:\n1. Clear error cause analysis\n2. Step-by-step debugging guide\n3. Feasible fix solutions\n4. Prevention measure suggestions\n\nExplanations should be concise and clear, solutions should be practical.',
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
  // Phase 7: Documentation Generation Workflow
  // ============================================
  {
    name: 'Documentation Generator',
    description: 'Documentation Generation - API documentation, usage guides, development docs',
    nodes: [
      {
        id: 'trigger-docs',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Documentation', triggerType: 'manual' },
      },
      {
        id: 'prompt-doc-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Documentation Requirements',
          prompt: `Documentation Generation Assistant

Please help me generate project documentation:

Documentation Type: {docType|API documentation}
Code/Module: {code|src/api/user.js}
Documentation Style: {style|JSDoc}
Output File Path: {output|docs/api.md}

Please generate documentation containing:
1. Overview and introduction
2. API interface/function list
3. Parameter descriptions
4. Return value descriptions
5. Usage examples
6. Important notes

IMPORTANT: Save the generated documentation to the specified output file path using file_write tool.`,
        },
      },
      {
        id: 'agent-documenter',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Documentation Generation Expert',
          modelId: 'default',
          systemPrompt:
            'You are a technical writing expert specializing in creating clear, complete technical documentation. ' +
            'Your task is to:\n' +
            '1. Generate well-structured documentation based on the user requirements\n' +
            '2. Include accurate technical descriptions and practical code examples\n' +
            '3. Add necessary notes and warnings\n' +
            '4. IMPORTANT: You MUST save the generated documentation to a file using the file_write tool\n' +
            '\n' +
            'The user will specify an output file path (e.g., "docs/api.md"). Use that exact path for the filepath parameter.\n' +
            'Use the file_write tool with these parameters:\n' +
            '- filepath: the output file path specified by the user\n' +
            '- content: the generated documentation content\n' +
            '\n' +
            'Example tool call:\n' +
            '{"tool": "file_write", "parameters": {"filepath": "docs/api.md", "content": "# API Documentation\\n\\n..."}}',
          temperature: 0.4,
          enabledTools: ['file_write'],
          maxIterations: 5,
        },
      },
    ],
    edges: [
      { id: 'e18', source: 'trigger-docs', target: 'prompt-doc-req' },
      { id: 'e19', source: 'prompt-doc-req', target: 'agent-documenter' },
    ],
  },

  // ============================================
  // Phase 8: Deployment Workflow
  // ============================================
  {
    name: 'Deploy Helper',
    description: 'Deployment Assistant - Build configuration, deployment scripts, CI/CD',
    nodes: [
      {
        id: 'trigger-deploy',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Deployment', triggerType: 'manual' },
      },
      {
        id: 'prompt-deploy-req',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Deployment Requirements',
          prompt: `Deployment Configuration Assistant

Please help me configure project deployment:

Project Type: {projectType|Node.js application}
Deployment Environment: {environment|Linux server}
Deployment Method: {method|Docker}
Output File: {output|deploy.sh}

Please generate:
1. Build script
2. Docker configuration file (if needed)
3. Deployment script
4. Environment variable description
5. Deployment step documentation

Please save configuration files and script files.`,
        },
      },
      {
        id: 'agent-deployer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Deployment Expert',
          modelId: 'default',
          systemPrompt:
            'You are a DevOps expert specializing in project deployment and CI/CD configuration. ' +
            'Please generate:\n' +
            '1. Usable build scripts\n' +
            '2. Docker configuration (if applicable)\n' +
            '3. Deployment scripts\n' +
            '4. Clear deployment instructions\n' +
            '\n' +
            'IMPORTANT: All configuration files and scripts must be saved using the file_write tool.\n' +
            'The user will specify an output file path. Use file_write with parameters:\n' +
            '- filepath: the file path specified by the user\n' +
            '- content: the generated file content\n' +
            '\n' +
            'Save each file separately (e.g., "build.sh", "Dockerfile", "deploy.sh").',
          temperature: 0.3,
          enabledTools: ['file_write'],
          maxIterations: 8,
        },
      },
    ],
    edges: [
      { id: 'e21', source: 'trigger-deploy', target: 'prompt-deploy-req' },
      { id: 'e22', source: 'prompt-deploy-req', target: 'agent-deployer' },
    ],
  },

  // ============================================
  // Yahoo Finance Stock Market Query Workflow
  // ============================================
  {
    name: 'Stock Market Analyzer',
    description:
      'Stock Market Analysis - Query stock quotes and analyze trends via Yahoo Finance API',
    nodes: [
      {
        id: 'trigger-stock',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Query', triggerType: 'manual' },
      },
      {
        id: 'prompt-stock-query',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Stock Query',
          prompt: `Stock Market Analysis Assistant

Please help me query and analyze stock information:

Stock Symbol: {symbol|AAPL}
Query Type: {queryType|Real-time quotes}
Analysis Options: {analysis|Price trends, volume, technical indicators}

Available query types:
- Real-time quotes: Current price, change, volume
- Historical data: Price trends for specified time range
- Company information: Fundamental data, financial metrics
- Technical analysis: Moving averages, RSI, MACD, etc.
- Market news: Related news and announcements

Please provide:
1. Stock real-time data overview
2. Technical analysis charts (description of supported tools)
3. Trend analysis and forecast
4. Investment recommendations and risk warnings`,
        },
      },
      {
        id: 'agent-stock-analyst',
        type: 'agent',
        position: { x: 100, y: 300 },
        data: {
          label: 'Stock Market Analyst',
          systemPrompt: `You are a professional stock market analyst specializing in technical analysis and fundamental analysis.

## Main Capabilities

1. **Stock Data Query**
   - **Priority: Use stock_quote tool** to get Yahoo Finance real-time data
   - stock_quote parameters: symbols (stock symbols, comma-separated for multiple), fields (optional: "price", "quote", "summary", "all")
   - Backup: Use http_request tool (Note: do not use browser_navigate or web_fetch)
   - Supported API endpoints:
     - Real-time quotes: https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}
     - Historical data: https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=1mo
     - Company information: https://query1.finance.yahoo.com/v10/finance/quoteSummary/{SYMBOL}?modules=summaryProfile

   **US Stock Index Codes**：
   - Dow Jones Industrial Average: ^DJI
   - S&P 500 Index: ^GSPC
   - NASDAQ Composite Index: ^IXIC
   - Russell 2000 Index: ^RUT

2. **Technical Analysis**
   - Moving Averages (MA5, MA10, MA20, MA50, MA200)
   - Relative Strength Index (RSI)
   - MACD Indicator
   - Volume Analysis
   - Support and Resistance Levels

3. **Fundamental Analysis**
   - Price-to-Earnings Ratio (P/E)
   - Price-to-Book Ratio (P/B)
   - Dividend Yield
   - Revenue and Profit Growth
   - Industry Comparison

## Data Query Methods

**Important: Prioritize using stock_quote tool to get Yahoo Finance data**

stock_quote tool usage example:
\`\`\`json
{
  "tool": "stock_quote",
  "parameters": {
    "symbols": "AAPL,TSLA,GOOGL",
    "fields": "price"
  }
}
\`\`\`

Query multiple indices:
\`\`\`json
{
  "tool": "stock_quote",
  "parameters": {
    "symbols": "^GSPC,^DJI,^IXIC",
    "fields": "price"
  }
}
\`\`\`

Backup: Use http_request tool
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

## Yahoo Finance API Response Data Parsing

API returns JSON structure:
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

Common fields:
- regularMarketPrice: Current price
- previousClose: Previous close price
- regularMarketChange: Change amount
- regularMarketChangePercent: Change percentage
- regularMarketVolume: Volume

Returned JSON data includes:
- meta: Trading time, currency unit
- chart: Result array
- quote: Real-time quotes (latest price, change, volume, etc.)
- timestamp: Timestamp array

## Analysis Output Format

Please output analysis results in the following format:

### 📊 {Stock Name} ({Symbol}) - Real-time Quotes

| Metric | Value |
|------|------|
| Current Price | $xxx.xx |
| Change | +x.xx% |
| Volume | xxx million |
| Open Price | $xxx.xx |
| High Price | $xxx.xx |
| Low Price | $xxx.xx |

### 📈 Technical Analysis

- **Trend**: Uptrend/Downtrend/Sideways
- **Support Level**: $xxx
- **Resistance Level**: $xxx
- **Technical Indicators**: MA/RSI/MACD analysis

### 💡 Investment Recommendation

- **Risk Rating**: Low/Medium/High
- **Action**: Buy/Hold/Sell
- **Target Price**: $xxx - $xxx

### ⚠️ Risk Warning

List relevant risk factors

## Important Notes

- Data may be delayed, verify data timeliness
- Investment involves risks, recommendations are for reference only
- Combine multiple indicators for comprehensive assessment
- Pay attention to overall market environment impact

Please provide analysis services with a professional, objective attitude.`,
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
  // Claude Code Style Development Workflow
  // ============================================
  {
    name: 'Code Development',
    description: 'Claude Code Style - Automatically read, edit, and test code',
    nodes: [
      {
        id: 'trigger-dev',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Development', triggerType: 'manual' },
      },
      {
        id: 'prompt-dev-task',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Development Task',
          prompt: `Code Development Assistant (Claude Code Mode)

Please help me complete the following development task:

Task Description: {task|Add user authentication functionality}
Project Path: {projectPath|./}
Related Files: {files|src/auth/login.js}

Workflow:
1. Use file_read to read related files
2. Analyze code and implement requirements
3. Use file_write to save modified code
4. If needed, use execute_command to run tests

Important Notes:
- Confirm file path before reading files
- Maintain consistent code style when modifying code
- Verify modifications are correct before saving files
- Provide detailed error information when encountering errors

Please start executing the task.`,
        },
      },
      {
        id: 'agent-developer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Development Assistant',
          systemPrompt: `You are an experienced software development engineer, similar to Claude Code. Your task is to help users complete various development tasks.

## Workflow

1. **Confirm Working Directory**: First ask the user where they want to create the project, or use get_work_directory to check current settings
2. **Set Working Directory** (if needed): Use set_work_directory to set the user-specified directory
3. **Understand Task**: Carefully understand the user's development requirements
4. **Read Files**: Use file_read tool to read related file contents
5. **Analyze Code**: Analyze existing code structure, determine modification plan
6. **Implement Changes**: Write or modify code
7. **Save Files**: Use file_write tool to save modified code
8. **Verify Results**: If needed, use execute_command to run tests

## Tool Usage Guidelines

- **get_work_directory**: Check current working directory (where files will be created)
- **set_work_directory**: Set working directory to user-specified location (use absolute path)
  - Windows example: "D:\\\\MyProjects" or "C:\\\\Users\\\\Username\\\\Documents\\\\MyProjects"
  - macOS/Linux example: "/Users/username/projects" or "/home/username/projects"
- **file_read**: Read file contents
- **file_write**: Save files, provide complete file content
- **file_list**: Use when searching for files
- **execute_command**: Run test commands (such as npm test)
- **web_search**: Find technical documentation or solutions

## Code Standards

- Maintain existing code style
- Add necessary comments
- Ensure code readability
- Follow best practices

## Important Notes

- **Confirm working directory before starting**: Ask the user where they want to create the project
- **Only modify one file at a time**
- **Verify content is correct again before saving files**
- **If encountering errors, provide detailed error information and solutions**
- **Summarize changes made after completing the task**

## Default Working Directory

By default, files will be created in the DeskClawProjects folder in the user's home directory.
- Windows: C:\\Users\\YourUsername\\DeskClawProjects
- macOS: /Users/yourusername/DeskClawProjects
- Linux: /home/yourusername/DeskClawProjects

If the user wants to create a project in another location, please use the set_work_directory tool to set it.

Please complete each development task in a professional, meticulous manner.`,
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

  // ============================================
  // Workflow Generator - Create custom workflows
  // ============================================
  {
    name: 'Workflow Generator',
    description: 'Create custom workflows from natural language descriptions',
    nodes: [
      {
        id: 'trigger-wf-gen',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Workflow Creation', triggerType: 'manual' },
      },
      {
        id: 'prompt-wf-description',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Workflow Description',
          prompt: `Workflow Generator Assistant

Please help me create a custom workflow:

Workflow Name: {name|My Custom Workflow}
Workflow Description: {description|A workflow that processes files and generates reports}
Workflow Steps: {steps|
1. Read input files from a directory
2. Process each file with a custom function
3. Generate a summary report
4. Save the report to a file
}

Additional Requirements: {requirements|Use file_read and file_write tools}

Please generate a complete workflow that can be saved and executed.`,
        },
      },
      {
        id: 'agent-wf-generator',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Workflow Architect',
          modelId: 'default',
          systemPrompt: `You are a workflow architect expert. Your task is to design and create complete, executable workflows based on natural language descriptions.

## Workflow Structure

A workflow consists of:
1. **Nodes** - Each node performs a specific action:
   - **trigger**: Starts the workflow (manual or scheduled)
   - **prompt**: Collects user input with parameters
   - **agent**: Uses AI to process tasks with optional tools
   - **tool**: Executes specific tools (currently handled by agent tools)
   - **shell**: Executes shell commands (with approval)
   - **conditional**: Branches workflow based on conditions

2. **Edges** - Connect nodes to define execution order

## Node ID Format

Use descriptive IDs like: "trigger-step1", "prompt-user-input", "agent-processor", "agent-saver"

## JSON Workflow Format

Generate a workflow JSON structure:

\`\`\`json
{
  "name": "Workflow Name",
  "description": "Workflow description",
  "nodes": [
    {
      "id": "trigger-start",
      "type": "trigger",
      "position": { "x": 100, "y": 50 },
      "data": { "label": "Start", "triggerType": "manual" }
    },
    {
      "id": "prompt-input",
      "type": "prompt",
      "position": { "x": 100, "y": 150 },
      "data": {
        "label": "Input Configuration",
        "prompt": "Your prompt with {param|default} placeholders"
      }
    },
    {
      "id": "agent-worker",
      "type": "agent",
      "position": { "x": 100, "y": 280 },
      "data": {
        "label": "Worker Agent",
        "modelId": "default",
        "systemPrompt": "Your agent instructions...",
        "temperature": 0.4,
        "enabledTools": ["file_read", "file_write", "web_search"],
        "maxIterations": 5
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "trigger-start", "target": "prompt-input" },
    { "id": "e2", "source": "prompt-input", "target": "agent-worker" }
  ]
}
\`\`\`

## Available Tools for Agents

- file_read: Read file contents (filepath parameter)
- file_write: Write file contents (filepath, content parameters)
- web_search: Search the web for information (query parameter)
- http_request: Make HTTP requests (url, method, headers parameters)
- stock_quote: Query stock data (symbols, fields parameters)
- get_time: Get current time (no parameters)
- execute_command: Run shell commands (command parameter)

## Position Coordinates

Use vertical spacing of 130-150px between connected nodes:
- Trigger: y = 50
- Prompt: y = 150
- Agent: y = 280
- Additional agent: y = 410, 540, etc.

## Output Format

Provide:
1. A brief overview of the workflow design
2. The complete workflow JSON code block
3. Instructions on how to use the workflow

Generate a practical, executable workflow that matches the user's requirements.`,
          temperature: 0.3,
          enabledTools: ['web_search'],
          maxIterations: 3,
        },
      },
    ],
    edges: [
      { id: 'e-wf-1', source: 'trigger-wf-gen', target: 'prompt-wf-description' },
      { id: 'e-wf-2', source: 'prompt-wf-description', target: 'agent-wf-generator' },
    ],
  },

  // ============================================
  // Data Analyzer Workflow
  // ============================================
  {
    name: 'Data Analyzer',
    description:
      'Data Analysis - Analyze CSV/JSON data, generate insights, create visualizations, and produce summary reports',
    nodes: [
      {
        id: 'trigger-data-analysis',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Analysis', triggerType: 'manual' },
      },
      {
        id: 'prompt-data-input',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Data File Configuration',
          prompt: `Data Analysis Assistant

Please help me analyze the following data:

Data File Path: {filepath|data.csv}
Data Format: {format|CSV}
Analysis Type: {analysis|Statistical summary, trends, patterns}
Output Format: {output|JSON report with charts}

Analysis Options:
- Statistical Summary: Mean, median, mode, standard deviation, min, max
- Trends: Time series analysis, moving averages, growth rates
- Patterns: Correlations, clusters, outliers
- Visualizations: Charts, graphs, summary tables

Please provide:
1. Data overview (row count, column names, data types)
2. Statistical summary for numerical columns
3. Key insights and patterns discovered
4. Data quality assessment (missing values, duplicates, outliers)
5. Recommendations for further analysis
6. Optional: Code to generate visualizations`,
        },
      },
      {
        id: 'agent-data-analyzer',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Data Analyst',
          modelId: 'default',
          systemPrompt: `You are an expert data analyst specializing in exploratory data analysis and statistical analysis.

## Main Capabilities

1. **Data Ingestion**
   - Use csv_to_json tool to convert CSV files to JSON for analysis
   - Use file_read tool to read JSON data files
   - Support multiple data formats: CSV, JSON, TSV

2. **Statistical Analysis**
   - Descriptive statistics: mean, median, mode, standard deviation, variance
   - Distribution analysis: histogram, skewness, kurtosis
   - Correlation analysis: Pearson, Spearman correlation coefficients
   - Outlier detection: IQR method, z-score method

3. **Data Quality Assessment**
   - Missing value analysis and imputation strategies
   - Duplicate detection and handling
   - Data type validation and cleaning
   - Outlier identification and treatment

4. **Trend Analysis**
   - Time series decomposition
   - Moving averages (simple, exponential)
   - Growth rate calculations
   - Seasonality detection

5. **Pattern Recognition**
   - Clustering patterns (k-means, hierarchical)
   - Association rules
   - Anomaly detection
   - Feature correlations

## Analysis Workflow

1. **Data Import**: Convert data to JSON format using csv_to_json tool
2. **Data Inspection**: Examine structure, dimensions, data types
3. **Data Cleaning**: Handle missing values, duplicates, outliers
4. **Statistical Summary**: Calculate key statistics for all numerical columns
5. **Pattern Discovery**: Identify correlations, trends, clusters
6. **Visualization**: Describe recommended charts and visualizations
7. **Reporting**: Generate comprehensive analysis report

## Tools Available

- csv_to_json: Convert CSV to JSON for analysis
- file_read: Read JSON data files
- file_write: Save analysis results and reports
- web_search: Look up statistical methods and best practices

## Output Format

Provide analysis in the following structure:

### 📊 Data Overview
- Dataset dimensions
- Column information
- Data types

### 📈 Statistical Summary
- Central tendency (mean, median, mode)
- Dispersion (std dev, variance, range)
- Distribution shape (skewness, kurtosis)

### 🔍 Data Quality
- Missing values summary
- Duplicate records
- Outliers detected
- Data type issues

### 📉 Trends and Patterns
- Time series trends (if applicable)
- Correlations between variables
- Significant patterns
- Key findings

### 💡 Insights and Recommendations
- Actionable insights
- Data quality recommendations
- Further analysis suggestions
- Business implications

### 📊 Visualizations
- Recommended chart types
- Key visualizations to create
- Interpretation of charts

Please provide thorough, accurate analysis with clear explanations of findings.`,
          temperature: 0.4,
          enabledTools: ['file_read', 'file_write', 'csv_to_json', 'web_search'],
          maxIterations: 10,
        },
      },
    ],
    edges: [
      { id: 'e-data-1', source: 'trigger-data-analysis', target: 'prompt-data-input' },
      { id: 'e-data-2', source: 'prompt-data-input', target: 'agent-data-analyzer' },
    ],
  },

  // ============================================
  // Content Publisher Workflow
  // ============================================
  {
    name: 'Content Publisher',
    description:
      'Content Publishing - Publish articles to multiple platforms (Medium, Dev.to, Hashnode) with formatting adjustments',
    nodes: [
      {
        id: 'trigger-publishing',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start Publishing', triggerType: 'manual' },
      },
      {
        id: 'prompt-content-input',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: {
          label: 'Content Configuration',
          prompt: `Content Publishing Assistant

Please help me publish content to multiple platforms:

Content Source: {source|article.md or direct text}
Title: {title|My Article Title}
Target Platforms: {platforms|Medium, Dev.to, Hashnode}
Tags: {tags|technology, programming}
Publication Status: {status|draft|published}

Supported Platforms:
- Medium: Requires markdown formatting, image handling
- Dev.to: Supports frontmatter, markdown, code highlighting
- Hashnode: Supports markdown, canonical URLs, SEO settings

Please provide:
1. Formatted content for each platform
2. Platform-specific adjustments (frontmatter, formatting)
3. Image handling instructions
4. SEO optimization for each platform
5. Publication instructions or draft status`,
        },
      },
      {
        id: 'agent-content-publisher',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Content Publisher',
          modelId: 'default',
          systemPrompt: `You are a content publishing specialist experienced in cross-platform content distribution.

## Platform Expertise

### Medium
- Markdown formatting
- Image handling (use hosted URLs)
- Publication status management
- Tag and category optimization
- Readability optimization

### Dev.to
- YAML frontmatter with metadata
- Code syntax highlighting
- Cover image requirements
- Series and organization
- Community interaction

### Hashnode
- Markdown with extensions
- SEO meta tags
- Canonical URLs
- Newsletter integration
- Analytics tracking

## Content Processing

1. **Content Ingestion**
   - Read markdown files using file_read tool
   - Parse frontmatter and metadata
   - Extract title, content, tags, images

2. **Platform Adaptation**
   - Format content for each target platform
   - Add platform-specific frontmatter
   - Adjust image references and sizing
   - Optimize for platform algorithms

3. **SEO Optimization**
   - Generate appropriate meta descriptions
   - Create canonical URLs
   - Optimize headings hierarchy
   - Add alt text for images

4. **Content Enhancement**
   - Improve readability scores
   - Add call-to-actions
   - Include social sharing prompts
   - Suggest related content links

## Tools Available

- file_read: Read source content files
- file_write: Save formatted content for each platform
- web_search: Research platform best practices and formatting guidelines

## Output Format

For each target platform, provide:

### Platform: [Platform Name]
- **Frontmatter/Metadata**: [Complete metadata block]
- **Formatted Content**: [Platform-specific markdown]
- **Image Instructions**: [How to handle images]
- **Publication Steps**: [Step-by-step guide]
- **SEO Notes**: [Platform-specific SEO tips]

### Publication Checklist
- [ ] Content formatted correctly
- [ ] Frontmatter complete
- [ ] Images processed
- [ ] Tags added
- [ ] SEO optimized
- [ ] Preview checked
- [ ] Scheduled/published

## Best Practices

- Maintain consistent voice across platforms
- Adapt tone to platform audience
- Use platform-unique features when beneficial
- Cross-link between platforms when appropriate
- Monitor performance and adjust strategy

Please deliver publication-ready content with clear instructions for each platform.`,
          temperature: 0.3,
          enabledTools: ['file_read', 'file_write', 'web_search'],
          maxIterations: 8,
        },
      },
    ],
    edges: [
      { id: 'e-pub-1', source: 'trigger-publishing', target: 'prompt-content-input' },
      { id: 'e-pub-2', source: 'prompt-content-input', target: 'agent-content-publisher' },
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
