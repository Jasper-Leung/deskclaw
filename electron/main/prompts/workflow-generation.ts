/**
 * Prompt templates for LLM-powered workflow generation
 */

/**
 * Generate a comprehensive workflow from natural language description
 */
export function getWorkflowGenerationPrompt(
  userDescription: string,
  availableTools: string[]
): string {
  return `You are an expert workflow designer for an AI automation platform. Your task is to convert user requirements into well-structured workflows.

# Available Node Types

## 1. trigger
- Description: Initiates the workflow
- Data fields: { label: string }
- Usage: Always start your workflow with exactly one trigger node

## 2. agent
- Description: LLM-powered agent that processes tasks using natural language
- Data fields:
  - label: string (node name)
  - modelId: string (use "default" or let user choose)
  - systemPrompt: string (instructions for the agent)
  - enabledTools: string[] (tools the agent can use)
  - maxIterations: number (default: 5)
- Usage: For complex reasoning, decision making, or tasks requiring LLM

## 3. prompt
- Description: Template prompt with variable substitution
- Data fields: { label: string, prompt: string }
- Usage: For predefined text templates or user input

## 4. tool
- Description: Execute a predefined tool/operation
- Data fields: { label: string, toolName: string, parameters: object }
- Available tools: ${availableTools.join(', ')}
- Usage: For specific operations like file operations, web search, etc.

## 5. shell
- Description: Execute shell commands
- Data fields: { label: string, command: string, requireApproval: boolean }
- Usage: For system-level operations (use with caution)

## 6. conditional
- Description: Branch workflow based on conditions
- Data fields: { label: string, condition: string }
- Source handles: "true" and "false" for branching
- Usage: For conditional logic and decision trees

# Workflow Structure Rules

1. **Exactly one trigger node** - Every workflow must start with a trigger
2. **Logical flow** - Connect nodes to create a clear execution path
3. **Node positioning** - Arrange nodes visually:
   - Trigger at top (y: 0, x: 250)
   - Subsequent nodes below, increment y by 150 for each level
   - Branch nodes side by side (increment x by 300)
4. **Edge connections** - Always connect source to target node IDs
5. **Conditional branching** - Use sourceHandle "true" and "false" for conditional nodes

# Output Format

Respond ONLY with valid JSON in this exact structure:

\`\`\`json
{
  "name": "Workflow Name",
  "description": "Brief description of what this workflow does",
  "nodes": [
    {
      "id": "node-1",
      "type": "trigger",
      "position": { "x": 250, "y": 0 },
      "data": { "label": "Start" }
    },
    {
      "id": "node-2",
      "type": "agent",
      "position": { "x": 250, "y": 150 },
      "data": {
        "label": "Process Request",
        "modelId": "default",
        "systemPrompt": "You are a helpful assistant...",
        "enabledTools": ["web_search", "file_write"],
        "maxIterations": 5
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2"
    }
  ]
}
\`\`\`

# Important Guidelines

1. **Be specific** - Use descriptive labels and prompts
2. **Think step by step** - Break complex tasks into smaller steps
3. **Use appropriate nodes** - Choose the right node type for each task
4. **Consider edge cases** - Add conditional nodes for error handling
5. **Optimize for clarity** - Keep workflows simple and readable
6. **Include helpful system prompts** - Give agents clear instructions

# User Request

The user wants to create a workflow for: "${userDescription}"

Generate a complete, executable workflow based on this description. Respond ONLY with the JSON object, no additional text.`;
}

/**
 * Generate a workflow refinement prompt for improving an existing workflow
 */
export function getWorkflowRefinementPrompt(currentWorkflow: string, userFeedback: string): string {
  return `You are an expert workflow designer. The user has provided feedback on an existing workflow and wants you to improve it.

# Current Workflow

\`\`\`json
${currentWorkflow}
\`\`\`

# User Feedback

${userFeedback}

# Your Task

Analyze the current workflow and the user's feedback, then provide an improved version of the workflow. Address the specific concerns raised in the feedback.

Keep the same JSON structure and follow all workflow design rules from the original guidelines.

Respond ONLY with the improved JSON workflow object, no additional text.`;
}

/**
 * Generate a prompt for explaining a workflow
 */
export function getWorkflowExplanationPrompt(workflowJson: string): string {
  return `You are a workflow documentation specialist. Explain the following workflow in clear, simple terms.

# Workflow Definition

\`\`\`json
${workflowJson}
\`\`\`

# Your Task

Provide:
1. **Summary**: A one-sentence overview of what this workflow does
2. **Steps**: A numbered list of each step in the workflow
3. **Use Cases**: 2-3 examples of when this workflow would be useful
4. **Requirements**: Any setup or configuration needed

Format your response in Markdown with clear headings.`;
}

/**
 * Get example workflows for few-shot prompting
 */
export function getWorkflowExamples(): string {
  return `
# Example Workflows

## Example 1: Web Research Agent
\`\`\`json
{
  "name": "Web Research Agent",
  "description": "Researches a topic and compiles findings into a document",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "position": { "x": 250, "y": 0 },
      "data": { "label": "Start Research" }
    },
    {
      "id": "prompt-1",
      "type": "prompt",
      "position": { "x": 250, "y": 150 },
      "data": {
        "label": "Research Topic",
        "prompt": "What topic would you like me to research?"
      }
    },
    {
      "id": "agent-1",
      "type": "agent",
      "position": { "x": 250, "y": 300 },
      "data": {
        "label": "Research Agent",
        "modelId": "default",
        "systemPrompt": "You are a research assistant. Search the web for information about the given topic, compile key findings, and organize them into a comprehensive summary.",
        "enabledTools": ["web_search"],
        "maxIterations": 5
      }
    },
    {
      "id": "tool-1",
      "type": "tool",
      "position": { "x": 250, "y": 450 },
      "data": {
        "label": "Save Report",
        "toolName": "file_write",
        "parameters": {
          "filepath": "research_report.md",
          "content": "{{agent-1.result}}"
        }
      }
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "trigger-1", "target": "prompt-1" },
    { "id": "edge-2", "source": "prompt-1", "target": "agent-1" },
    { "id": "edge-3", "source": "agent-1", "target": "tool-1" }
  ]
}
\`\`\`

## Example 2: File Processing Pipeline
\`\`\`json
{
  "name": "File Processing Pipeline",
  "description": "Monitors a directory and processes new files",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "position": { "x": 250, "y": 0 },
      "data": { "label": "New File Detected" }
    },
    {
      "id": "tool-1",
      "type": "tool",
      "position": { "x": 250, "y": 150 },
      "data": {
        "label": "Read File",
        "toolName": "file_read",
        "parameters": { "filepath": "{{trigger-1.filepath}}" }
      }
    },
    {
      "id": "conditional-1",
      "type": "conditional",
      "position": { "x": 250, "y": 300 },
      "data": {
        "label": "Is Text File?",
        "condition": "tool-1.result.content"
      }
    },
    {
      "id": "agent-1",
      "type": "agent",
      "position": { "x": 100, "y": 450 },
      "data": {
        "label": "Process Text",
        "modelId": "default",
        "systemPrompt": "Analyze and summarize the text content.",
        "enabledTools": [],
        "maxIterations": 1
      }
    },
    {
      "id": "agent-2",
      "type": "agent",
      "position": { "x": 400, "y": 450 },
      "data": {
        "label": "Log Error",
        "modelId": "default",
        "systemPrompt": "Log that a non-text file was received.",
        "enabledTools": [],
        "maxIterations": 1
      }
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "trigger-1", "target": "tool-1" },
    { "id": "edge-2", "source": "tool-1", "target": "conditional-1" },
    { "id": "edge-3", "source": "conditional-1", "target": "agent-1", "sourceHandle": "true" },
    { "id": "edge-4", "source": "conditional-1", "target": "agent-2", "sourceHandle": "false" }
  ]
}
\`\`\`
`;
}
