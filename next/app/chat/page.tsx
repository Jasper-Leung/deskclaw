'use client';

import { AppShell } from '@/components/layout/app-shell';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Zap,
  Workflow,
  Loader2,
  Wrench,
  Copy,
  Check,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { QuickChatAgentSelector, QuickChatSettings } from '@/components/quick-chat/settings';
import { ContextUsageBar } from '@/components/chat/context-usage-bar';

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'tool_result' | 'tool_error';
  content: string;
  timestamp?: number;
  toolName?: string;
}

interface Model {
  id: string;
  model_id: string;
  display_name: string;
  provider_name: string;
  is_custom: number;
}

interface Session {
  id: string;
  title: string;
  agent_id: string | null;
  created_at: number;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  is_preset?: number;
}

interface WorkflowExecutionResult {
  success: boolean;
  workflowId: string;
  executionId: string;
  status: string;
  results: Record<string, unknown>;
  error?: string;
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

interface SkillMetadata {
  author?: string;
  version?: string;
  domain?: string;
  triggers?: string[];
  role?: string;
  scope?: string;
  outputFormat?: string;
  relatedSkills?: string[];
}

interface Skill {
  id: string;
  name: string;
  description?: string;
  metadata_json?: SkillMetadata;
  enabled?: boolean;
}

interface SkillSuggestion {
  skill: Skill;
  matchScore: number;
  matchedTriggers: string[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [workflowParams, setWorkflowParams] = useState<Record<string, string>>({});
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [showToolDialog, setShowToolDialog] = useState(false);
  const [selectedToolForDialog, setSelectedToolForDialog] = useState<Tool | null>(null);
  const [toolParams, setToolParams] = useState<Record<string, string>>({});
  // Quick Chat state
  const [quickChatAgent, setQuickChatAgent] = useState<{ id: string; name: string } | null>(null);
  const [quickChatSelectedTools, setQuickChatSelectedTools] = useState<Set<string>>(new Set());
  // Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsEnabled, setSkillsEnabled] = useState(true);
  const [skillSuggestions, setSkillSuggestions] = useState<SkillSuggestion[]>([]);
  const [skillExecuting, setSkillExecuting] = useState(false);
  // Work directory state
  const [workDirectory, setWorkDirectory] = useState<string>('');
  const [showWorkDirDialog, setShowWorkDirDialog] = useState(false);
  const [newWorkDir, setNewWorkDir] = useState('');
  // Auto-workflow states
  const [autoWorkflowEnabled, setAutoWorkflowEnabled] = useState(true);
  const [workflowMatchPreview, setWorkflowMatchPreview] = useState<{
    workflowId: string;
    workflowName: string;
    confidence: number;
  } | null>(null);
  const [workflowProgress, setWorkflowProgress] = useState<{
    workflowName: string;
    currentNode: string;
    status: string;
    output: string[];
  } | null>(null);
  // Context menu and copy states
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
  } | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const workflowCleanupRef = useRef<(() => void) | null>(null);
  const listenersSetupRef = useRef(false);
  const processingDoneRef = useRef(false);
  const toolsEnabledRef = useRef(false);
  const selectedToolsRef = useRef<string[]>([]);
  const selectedModelRef = useRef<string>('');
  const lastExecutedToolRef = useRef<{ tool: string; params: string } | null>(null); // Track last executed tool to prevent duplicates

  // Keep refs in sync with state
  useEffect(() => {
    toolsEnabledRef.current = toolsEnabled;
  }, [toolsEnabled]);

  useEffect(() => {
    selectedToolsRef.current = selectedTools;
  }, [selectedTools]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    loadModels();
    loadSessions();
    loadWorkflows();
    loadTools();
    loadSkills();
    loadWorkDirectory();
    loadQuickChatSettings();
    setupStreamListeners();
    setupWorkflowListeners();
    setupScheduledListeners();
    setupChannelsListeners();

    // Track page view
    window.electronAPI?.evolution?.trackEvent?.('page_view', { page: 'chat' });

    // Check if there's a scheduled task session to load
    const scheduledSessionId = sessionStorage.getItem('scheduledSessionId');
    if (scheduledSessionId) {
      // Clear the storage
      sessionStorage.removeItem('scheduledSessionId');
      // Load the session
      loadSession(scheduledSessionId);
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      if (workflowCleanupRef.current) {
        workflowCleanupRef.current();
      }
      if (scheduledCleanupRef.current) {
        scheduledCleanupRef.current();
      }
      if (channelsCleanupRef.current) {
        channelsCleanupRef.current();
      }
    };
  }, []);

  useEffect(() => {
    const savedDefault = localStorage.getItem('deskclaw-default-model');
    if (savedDefault && models.some((m) => m.id === savedDefault)) {
      setSelectedModel(savedDefault);
    } else if (models.length > 0) {
      setSelectedModel(models[0].id);
    }
  }, [models]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Update skill suggestions based on input
  useEffect(() => {
    if (input.trim() && skillsEnabled) {
      const suggestions = findMatchingSkills(input);
      setSkillSuggestions(suggestions);
    } else {
      setSkillSuggestions([]);
    }
  }, [input, skillsEnabled]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  }, [contextMenu]);

  /**
   * Robust JSON parser that handles malformed JSON from AI responses
   * Also supports XML-formatted tool calls and tool name aliases
   */
  const parseToolCall = (
    jsonString: string
  ): { tool: string; parameters: Record<string, unknown> } | null => {
    console.log('Attempting to parse tool call from:', jsonString);

    // Clean up the string - remove markdown code blocks if present
    let cleanStr = jsonString.trim();
    if (cleanStr.startsWith('```json')) {
      cleanStr = cleanStr.slice(7);
    } else if (cleanStr.startsWith('```')) {
      cleanStr = cleanStr.slice(3);
    }
    if (cleanStr.endsWith('```')) {
      cleanStr = cleanStr.slice(0, -3);
    }
    cleanStr = cleanStr.trim();

    // Method 0: Try XML format first (some models output XML instead of JSON)
    const xmlResult = parseXMLToolCall(cleanStr);
    if (xmlResult) {
      // Apply alias matching to the tool name from XML
      const availableToolNames = availableTools.map((t) => t.name);
      const matchedTool = findBestToolMatch(xmlResult.tool, availableToolNames);
      if (matchedTool) {
        console.log(`XML tool name "${xmlResult.tool}" matched to "${matchedTool}"`);
        return { tool: matchedTool, parameters: xmlResult.parameters };
      }
      return xmlResult;
    }

    // Method 1: Direct JSON.parse
    try {
      const parsed = JSON.parse(cleanStr);
      if (parsed.tool && typeof parsed.tool === 'string') {
        // Apply alias matching to the tool name
        const availableToolNames = availableTools.map((t) => t.name);
        const matchedTool = findBestToolMatch(parsed.tool, availableToolNames);

        const finalToolName = matchedTool || parsed.tool;
        if (!matchedTool) {
          console.warn(`Tool "${parsed.tool}" not found in available tools, using as-is`);
        }

        return {
          tool: finalToolName,
          parameters: parsed.parameters || parsed.params || parsed.args || {},
        };
      }
    } catch (e) {
      console.log('Direct JSON.parse failed, trying fallback methods');
    }

    // Method 2: Extract tool name and parse parameters separately
    const toolMatch = cleanStr.match(/"tool"\s*:\s*"([^"]+)"/);
    if (!toolMatch) {
      // Try alternative formats
      const altToolMatch = cleanStr.match(/"name"\s*:\s*"([^"]+)"/);
      if (altToolMatch) {
        const rawToolName = altToolMatch[1];
        console.log('Found tool name in alternative format:', rawToolName);

        // Apply alias matching
        const availableToolNames = availableTools.map((t) => t.name);
        const matchedTool = findBestToolMatch(rawToolName, availableToolNames);
        const finalToolName = matchedTool || rawToolName;

        if (!matchedTool) {
          console.warn(`Tool "${rawToolName}" not found in available tools, using as-is`);
        } else {
          console.log(`Matched "${rawToolName}" to "${finalToolName}"`);
        }

        // Try to find parameters

        const paramsMatch =
          cleanStr.match(/"parameters"\s*:\s*\{([\s\S]*?)\}(?=\s*[,}])/) ||
          cleanStr.match(/"params"\s*:\s*\{([\s\S]*?)\}(?=\s*[,}])/) ||
          cleanStr.match(/"args"\s*:\s*\{([\s\S]*?)\}(?=\s*[,}])/);

        let parameters: Record<string, unknown> = {};
        if (paramsMatch) {
          try {
            parameters = JSON.parse(`{${paramsMatch[1]}}`);
          } catch {
            parameters = extractParametersManually(paramsMatch[1]);
          }
        }

        return { tool: finalToolName, parameters };
      }

      console.log('Could not extract tool name');
      return null;
    }

    const rawToolName = toolMatch[1];
    console.log('Extracted tool name:', rawToolName);

    // Apply alias matching
    const availableToolNames = availableTools.map((t) => t.name);
    const matchedTool = findBestToolMatch(rawToolName, availableToolNames);
    const finalToolName = matchedTool || rawToolName;

    if (!matchedTool) {
      console.warn(`Tool "${rawToolName}" not found in available tools, using as-is`);
    } else {
      console.log(`Matched "${rawToolName}" to "${finalToolName}"`);
    }

    // Extract parameters object
    // eslint-disable-next-line no-useless-escape
    const paramsMatch = cleanStr.match(/"parameters"\s*:\s*\{([\s\S]*?)\}(?=\s*[,\}])/);
    let parameters: Record<string, unknown> = {};

    if (paramsMatch) {
      const paramsStr = paramsMatch[1];
      console.log('Parameters string:', paramsStr);

      // Try to parse as-is
      try {
        parameters = JSON.parse(`{${paramsStr}}`);
      } catch (e) {
        parameters = extractParametersManually(paramsStr);
      }
    }

    return { tool: finalToolName, parameters };
  };

  /**
   * Tool alias mappings for common variations
   * Some models change spaces to underscores or use different naming conventions
   */
  const TOOL_ALIASES: Record<string, string[]> = {
    file_read: ['file read', 'fileread', 'document reader', 'read file', 'open file', 'readfile'],
    file_write: [
      'file write',
      'filewrite',
      'save file',
      'write to file',
      'create file',
      'writefile',
    ],
    file_list: ['file list', 'filelist', 'list files', 'list directory', 'ls', 'dir'],
    web_search: [
      'web-search',
      'websearch',
      'internet search',
      'search web',
      'google search',
      'online search',
    ],
    http_request: [
      'http-request',
      'httprequest',
      'make request',
      'http call',
      'api request',
      'fetch',
    ],
    get_time: ['get-time', 'gettime', 'current time', 'time', 'date'],
    execute_command: [
      'execute-command',
      'executecommand',
      'run command',
      'shell',
      'bash',
      'terminal',
      'cmd',
    ],
    set_work_directory: [
      'set-work-directory',
      'setworkdirectory',
      'set work dir',
      'change directory',
      'cd',
    ],
    get_work_directory: [
      'get-work-directory',
      'getworkdirectory',
      'get work dir',
      'current directory',
      'pwd',
    ],
    workflow_list: ['workflow-list', 'workflowlist', 'list workflows', 'workflows'],
    scheduled_list: ['scheduled-list', 'scheduledlist', 'list scheduled', 'scheduled tasks'],
    scheduled_create: ['scheduled-create', 'scheduledcreate', 'create scheduled', 'add scheduled'],
    scheduled_update: ['scheduled-update', 'scheduledupdate', 'update scheduled'],
    scheduled_delete: [
      'scheduled-delete',
      'scheduleddelete',
      'delete scheduled',
      'remove scheduled',
    ],
    scheduled_toggle: [
      'scheduled-toggle',
      'scheduledtoggle',
      'toggle scheduled',
      'enable disable scheduled',
    ],
  };

  /**
   * Calculate Levenshtein distance for fuzzy string matching
   */
  const levenshteinDistance = (str1: string, str2: string): number => {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  };

  /**
   * Find the best matching tool name using aliases and fuzzy matching
   */
  const findBestToolMatch = (inputToolName: string, availableTools: string[]): string | null => {
    if (!inputToolName) return null;

    const normalizedInput = inputToolName.toLowerCase().trim();

    // Method 1: Exact match
    if (availableTools.includes(normalizedInput)) {
      return normalizedInput;
    }

    // Method 2: Try underscore-to-space and space-to-underscore conversions
    const spaceToUnderscore = normalizedInput.replace(/\s+/g, '_');
    const underscoreToSpace = normalizedInput.replace(/_/g, ' ');
    if (availableTools.includes(spaceToUnderscore)) return spaceToUnderscore;
    if (availableTools.includes(underscoreToSpace)) return underscoreToSpace;

    // Method 3: Check alias mappings
    for (const [canonicalTool, aliases] of Object.entries(TOOL_ALIASES)) {
      if (aliases.some((alias) => alias.toLowerCase() === normalizedInput)) {
        return canonicalTool;
      }
    }

    // Method 4: Fuzzy matching with Levenshtein distance
    // Find the closest match with a threshold
    const threshold = 3; // Maximum allowed edit distance
    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const tool of availableTools) {
      const distance = levenshteinDistance(normalizedInput, tool.toLowerCase());
      if (distance < bestDistance && distance <= threshold) {
        bestDistance = distance;
        bestMatch = tool;
      }
    }

    return bestMatch;
  };

  /**
   * Parse XML-formatted tool calls from models that output XML instead of JSON
   * Supports Anthropic and OpenAI XML formats
   */
  const parseXMLToolCall = (
    content: string
  ): { tool: string; parameters: Record<string, unknown> } | null => {
    console.log('Attempting to parse XML tool call from:', content);

    // Try Anthropic format: <function_calls><invoke name="tool_name">...</invoke></function_calls>
    const anthropicMatch = content.match(/<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/);
    if (anthropicMatch) {
      const toolName = anthropicMatch[1];
      const paramsContent = anthropicMatch[2];

      // Extract parameters from <parameter> tags
      const parameters: Record<string, unknown> = {};
      const paramRegex = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g;
      let paramMatch;

      while ((paramMatch = paramRegex.exec(paramsContent)) !== null) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2].trim();

        // Try to parse as JSON first
        try {
          parameters[paramName] = JSON.parse(paramValue);
        } catch {
          // If not JSON, try to infer type
          if (paramValue === 'true') {
            parameters[paramName] = true;
          } else if (paramValue === 'false') {
            parameters[paramName] = false;
          } else if (paramValue === 'null') {
            parameters[paramName] = null;
          } else if (/^-?\d+(\.\d+)?$/.test(paramValue)) {
            parameters[paramName] = parseFloat(paramValue);
          } else {
            parameters[paramName] = paramValue;
          }
        }
      }

      console.log('Parsed Anthropic XML tool call:', { tool: toolName, parameters });
      return { tool: toolName, parameters };
    }

    // Try OpenAI format with quotes: <function="tool_name">parameters</function>
    const openaiMatch = content.match(/<function="([^"]+)"[^>]*>([\s\S]*?)<\/function>/);
    if (openaiMatch) {
      const toolName = openaiMatch[1];
      const paramsContent = openaiMatch[2].trim();

      let parameters: Record<string, unknown> = {};

      try {
        // Try to parse as JSON
        parameters = JSON.parse(paramsContent);
      } catch {
        // If not JSON, check for <parameter> tags (both formats)
        const paramRegexWithQuotes = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/g;
        const paramRegexNoQuotes = /<parameter=([^\s>]+)[^>]*>([\s\S]*?)<\/parameter>/g;

        let paramMatch;
        let hasParameterTags = false;

        // Try with quotes first
        while ((paramMatch = paramRegexWithQuotes.exec(paramsContent)) !== null) {
          hasParameterTags = true;
          const paramName = paramMatch[1];
          const paramValue = paramMatch[2].trim();

          try {
            parameters[paramName] = JSON.parse(paramValue);
          } catch {
            if (paramValue === 'true') {
              parameters[paramName] = true;
            } else if (paramValue === 'false') {
              parameters[paramName] = false;
            } else if (paramValue === 'null') {
              parameters[paramName] = null;
            } else if (/^-?\d+(\.\d+)?$/.test(paramValue)) {
              parameters[paramName] = parseFloat(paramValue);
            } else {
              parameters[paramName] = paramValue;
            }
          }
        }

        // Then try without quotes
        while ((paramMatch = paramRegexNoQuotes.exec(paramsContent)) !== null) {
          hasParameterTags = true;
          const paramName = paramMatch[1];
          const paramValue = paramMatch[2].trim();

          try {
            parameters[paramName] = JSON.parse(paramValue);
          } catch {
            if (paramValue === 'true') {
              parameters[paramName] = true;
            } else if (paramValue === 'false') {
              parameters[paramName] = false;
            } else if (paramValue === 'null') {
              parameters[paramName] = null;
            } else if (/^-?\d+(\.\d+)?$/.test(paramValue)) {
              parameters[paramName] = parseFloat(paramValue);
            } else {
              parameters[paramName] = paramValue;
            }
          }
        }

        if (!hasParameterTags) {
          // If no parameter tags found, treat as raw content
          parameters = { content: paramsContent };
        }
      }

      console.log('Parsed OpenAIAI XML tool call:', { tool: toolName, parameters });
      return { tool: toolName, parameters };
    }

    // Try OpenAI format without quotes: <function=tool_name>parameters</function>
    // Use [\s\S]* instead of [\s\S]*? to handle empty content properly
    const openaiMatchNoQuotes = content.match(/<function=([^\s>]+)[^>]*>([\s\S]*)<\/function>/);
    if (openaiMatchNoQuotes) {
      const toolName = openaiMatchNoQuotes[1];
      const paramsContent = openaiMatchNoQuotes[2].trim();

      let parameters: Record<string, unknown> = {};

      // First try to parse as JSON
      if (paramsContent) {
        try {
          parameters = JSON.parse(paramsContent);
        } catch {
          // If not JSON, check for <parameter=name> format
          const paramRegex = /<parameter=([^\s>]+)[^>]*>([\s\S]*?)<\/parameter>/g;
          let paramMatch;
          let hasParameterTags = false;

          while ((paramMatch = paramRegex.exec(paramsContent)) !== null) {
            hasParameterTags = true;
            const paramName = paramMatch[1];
            const paramValue = paramMatch[2].trim();

            // Try to parse as JSON first
            try {
              parameters[paramName] = JSON.parse(paramValue);
            } catch {
              // If not JSON, try to infer type
              if (paramValue === 'true') {
                parameters[paramName] = true;
              } else if (paramValue === 'false') {
                parameters[paramName] = false;
              } else if (paramValue === 'null') {
                parameters[paramName] = null;
              } else if (/^-?\d+(\.\d+)?$/.test(paramValue)) {
                parameters[paramName] = parseFloat(paramValue);
              } else {
                parameters[paramName] = paramValue;
              }
            }
          }

          if (!hasParameterTags) {
            // If no parameter tags found, treat as raw content
            parameters = { content: paramsContent };
          }
        }
      }
      // If paramsContent is empty, parameters remains {}

      console.log('Parsed OpenAI XML tool call (no quotes):', { tool: toolName, parameters });
      return { tool: toolName, parameters };
    }

    // Try OpenAI format with quotes and no closing tag (self-closing): <function="tool_name"/>
    const openaiSelfClosing = content.match(/<function="([^"]+)"\s*\/>/);
    if (openaiSelfClosing) {
      const toolName = openaiSelfClosing[1];
      console.log('Parsed OpenAI XML tool call (self-closing with quotes):', {
        tool: toolName,
        parameters: {},
      });
      return { tool: toolName, parameters: {} };
    }

    // Try OpenAI format without quotes and no closing tag (self-closing): <function=tool_name/>
    const openaiSelfClosingNoQuotes = content.match(/<function=([^\s>]+)\s*\/>/);
    if (openaiSelfClosingNoQuotes) {
      const toolName = openaiSelfClosingNoQuotes[1];
      console.log('Parsed OpenAI XML tool call (self-closing no quotes):', {
        tool: toolName,
        parameters: {},
      });
      return { tool: toolName, parameters: {} };
    }

    // Try generic format with quotes: <tool name="tool_name">...</tool>
    const genericMatch = content.match(/<tool\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool>/);
    if (genericMatch) {
      const toolName = genericMatch[1];
      const paramsContent = genericMatch[2].trim();

      let parameters: Record<string, unknown> = {};
      try {
        parameters = JSON.parse(paramsContent);
      } catch {
        parameters = { content: paramsContent };
      }

      console.log('Parsed generic XML tool call:', { tool: toolName, parameters });
      return { tool: toolName, parameters };
    }

    // Try generic format without quotes: <tool name=tool_name>...</tool>
    const genericMatchNoQuotes = content.match(/<tool\s+name=([^\s>]+)[^>]*>([\s\S]*?)<\/tool>/);
    if (genericMatchNoQuotes) {
      const toolName = genericMatchNoQuotes[1];
      const paramsContent = genericMatchNoQuotes[2].trim();

      let parameters: Record<string, unknown> = {};
      try {
        parameters = JSON.parse(paramsContent);
      } catch {
        parameters = { content: paramsContent };
      }

      console.log('Parsed generic XML tool call (no quotes):', { tool: toolName, parameters });
      return { tool: toolName, parameters };
    }

    console.log('No valid XML tool call format found');
    return null;
  };

  /**
   * Manually extract parameters from a string
   */
  const extractParametersManually = (paramsStr: string): Record<string, unknown> => {
    const parameters: Record<string, unknown> = {};

    // Extract key-value pairs using regex
    const kvRegex = /"([^"]+)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"|"([^"]+)"\s*:\s*([^,}\s]+)/g;
    let match;
    while ((match = kvRegex.exec(paramsStr)) !== null) {
      const key = match[1] || match[3];
      const value = match[2] || match[4];

      // Try to parse as number, boolean, or keep as string
      if (value === 'true') {
        parameters[key] = true;
      } else if (value === 'false') {
        parameters[key] = false;
      } else if (value === 'null') {
        parameters[key] = null;
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        parameters[key] = parseFloat(value);
      } else {
        parameters[key] = value;
      }
    }

    return parameters;
  };

  /**
   * Truncate messages for LLM context to prevent token overflow
   * Keeps recent messages and truncates long content
   */
  const truncateMessagesForLLM = (
    messages: Message[],
    maxTotalChars: number = 100000
  ): Message[] => {
    let totalChars = 0;
    const result: Message[] = [];

    // Process messages from newest to oldest
    const reversedMessages = [...messages].reverse();

    for (const msg of reversedMessages) {
      const msgLength = msg.content.length;

      if (totalChars + msgLength > maxTotalChars) {
        // Truncate this message if needed
        const remaining = maxTotalChars - totalChars;
        if (remaining > 1000) {
          result.unshift({
            ...msg,
            content: msg.content.substring(0, remaining) + '\n\n... (content truncated)',
          });
          totalChars = maxTotalChars;
        }
        break;
      }

      result.unshift(msg);
      totalChars += msgLength;
    }

    // Always include the first user message if available
    const firstUserMsg = messages.find((m) => m.role === 'user');
    if (firstUserMsg && !result.includes(firstUserMsg)) {
      result.unshift(firstUserMsg);
    }

    console.log(
      `[Context Control] Truncated ${messages.length} messages to ${result.length} messages (${totalChars} chars)`
    );
    return result;
  };

  const setupStreamListeners = () => {
    // Prevent setting up listeners multiple times
    if (listenersSetupRef.current) {
      return;
    }

    if (window.electronAPI) {
      const unsubChunk = window.electronAPI.llm.onStreamChunk(
        (chunk: { content: string; done: boolean }) => {
          if (chunk.done) {
            // Prevent duplicate processing of done event
            if (processingDoneRef.current) {
              console.log('Ignoring duplicate done event');
              return;
            }
            processingDoneRef.current = true;

            setStreamingContent((prev) => {
              if (prev) {
                console.log('Stream completed, content:', prev.substring(0, 200));
                console.log('Tools enabled (ref):', toolsEnabledRef.current);

                setMessages((prevMsgs) => {
                  // Prevent duplicate messages - check if last message has same content
                  const lastMsg = prevMsgs[prevMsgs.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === prev) {
                    console.log('Preventing duplicate message');
                    processingDoneRef.current = false;
                    return prevMsgs;
                  }

                  const newMsgs = [
                    ...prevMsgs,
                    {
                      role: 'assistant' as const,
                      content: prev,
                      timestamp: Date.now(),
                    },
                  ];

                  // Check if the response contains a tool call (use ref to get current state)
                  if (toolsEnabledRef.current) {
                    console.log('Checking for tool call in response...');

                    // Try to extract tool call more precisely
                    let toolCall = null;

                    // Method 1: Look for XML format <function=tool_name>...</function>
                    const xmlMatch = prev.match(
                      /<function\s*=?[=\s]*[^\s>]+[^>]*>[\s\S]*?<\/function>/i
                    );
                    if (xmlMatch) {
                      console.log('Found XML function tag, trying to parse...');
                      const fullXml = xmlMatch[0];
                      toolCall = parseToolCall(fullXml);
                      if (toolCall) {
                        console.log('Successfully parsed XML tool call:', toolCall);
                        // Check if this exact tool call was already executed
                        const paramsString = JSON.stringify(toolCall.parameters);
                        const lastExecuted = lastExecutedToolRef.current;

                        if (
                          lastExecuted &&
                          lastExecuted.tool === toolCall.tool &&
                          lastExecuted.params === paramsString
                        ) {
                          console.log('This tool call was already executed, skipping');
                          toolCall = null;
                        } else {
                          lastExecutedToolRef.current = {
                            tool: toolCall.tool,
                            params: paramsString,
                          };
                        }
                      }
                    }

                    // Method 2: Look for JSON object with "tool" key
                    const toolKeyMatch = prev.match(/"tool"\s*:\s*"[^"]+"/);
                    if (toolKeyMatch) {
                      console.log('Found "tool" key, extracting full JSON object...');

                      // Find the start of the JSON object (go back to find the opening brace)
                      const matchStart = prev.indexOf(toolKeyMatch[0]);
                      let jsonStart = matchStart;
                      while (jsonStart > 0 && prev[jsonStart] !== '{') {
                        jsonStart--;
                      }

                      // Extract the complete JSON object by matching braces
                      if (prev[jsonStart] === '{') {
                        let braceCount = 0;
                        let jsonEnd = -1;
                        for (let i = jsonStart; i < prev.length; i++) {
                          if (prev[i] === '{') braceCount++;
                          if (prev[i] === '}') braceCount--;
                          if (braceCount === 0) {
                            jsonEnd = i + 1;
                            break;
                          }
                        }

                        if (jsonEnd !== -1) {
                          const jsonStr = prev.substring(jsonStart, jsonEnd);
                          console.log('Extracted JSON:', jsonStr);
                          toolCall = parseToolCall(jsonStr);
                          if (toolCall) {
                            console.log('Successfully parsed tool call:', toolCall);

                            // Check if this exact tool call was already executed
                            const paramsString = JSON.stringify(toolCall.parameters);
                            const lastExecuted = lastExecutedToolRef.current;

                            if (
                              lastExecuted &&
                              lastExecuted.tool === toolCall.tool &&
                              lastExecuted.params === paramsString
                            ) {
                              console.log('This tool call was already executed, skipping');
                              toolCall = null;
                            } else {
                              lastExecutedToolRef.current = {
                                tool: toolCall.tool,
                                params: paramsString,
                              };
                            }
                          }
                        }
                      }
                    }

                    if (toolCall && toolCall.tool && toolCall.parameters) {
                      console.log('Executing tool:', toolCall.tool);
                      // Automatically execute the tool
                      executeToolAsync(toolCall.tool, toolCall.parameters, newMsgs);
                      // Return newMsgs without adding again since executeToolAsync will handle it
                      return newMsgs;
                    } else {
                      console.log('No valid tool call found (toolCall:', toolCall, ')');
                    }
                  } else {
                    console.log('No "tool" key found in response');
                  }

                  // Check if we need to send the response to a channel
                  const channelInfoStr = sessionStorage.getItem('currentChannelInfo');
                  if (channelInfoStr && window.electronAPI?.channels) {
                    try {
                      const channelInfo = JSON.parse(channelInfoStr);
                      // Send the assistant's response to the channel
                      window.electronAPI.channels
                        .send(channelInfo.channelId, channelInfo.peerId, prev)
                        .then(() => {
                          console.log('Response sent to channel:', channelInfo);
                        })
                        .catch((error) => {
                          console.error('Failed to send response to channel:', error);
                        });
                      // Clear the channel info after sending
                      sessionStorage.removeItem('currentChannelInfo');
                    } catch (error) {
                      console.error('Failed to parse channel info:', error);
                    }
                  }

                  processingDoneRef.current = false;
                  return newMsgs;
                });
              }
              processingDoneRef.current = false;
              return '';
            });
            setIsLoading(false);
          } else {
            // Reset flag when receiving new chunks
            processingDoneRef.current = false;
            setStreamingContent((prev) => prev + chunk.content);
          }
        }
      );

      const unsubError = window.electronAPI.llm.onStreamError((error: { message: string }) => {
        console.error('Stream error:', error);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
          },
        ]);
        setStreamingContent('');
        setIsLoading(false);
      });

      cleanupRef.current = () => {
        unsubChunk();
        unsubError();
        listenersSetupRef.current = false;
      };

      listenersSetupRef.current = true;
    }
  };

  const setupWorkflowListeners = () => {
    if (window.electronAPI && window.electronAPI.workflows) {
      const unsubMatched = window.electronAPI.workflows.onMatched(
        (match: { workflowId: string; workflowName: string; confidence: number }) => {
          console.log('Workflow matched:', match);
          setWorkflowMatchPreview(match);
        }
      );

      const unsubProgress = window.electronAPI.workflows.onProgress(
        (update: {
          workflowId: string;
          workflowName: string;
          type: string;
          nodeId?: string;
          nodeName?: string;
        }) => {
          console.log('Workflow progress:', update);
          setWorkflowProgress((prev) => ({
            workflowName: update.workflowName,
            currentNode: update.nodeName || 'Unknown',
            status:
              update.type === 'node_start'
                ? 'Running'
                : update.type === 'node_complete'
                  ? 'Completed'
                  : update.type,
            output: prev?.output || [],
          }));
        }
      );

      const unsubOutput = window.electronAPI.workflows.onOutput(
        (output: { workflowId: string; nodeId: string; nodeName: string; content: string }) => {
          console.log('Workflow output:', output);
          setWorkflowProgress((prev) => ({
            workflowName: prev?.workflowName || 'Workflow',
            currentNode: output.nodeName,
            status: 'Output',
            output: [...(prev?.output || []), output.content],
          }));

          // Also add as assistant message
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: output.content,
              timestamp: Date.now(),
            },
          ]);
        }
      );

      const unsubError = window.electronAPI.workflows.onError((error: { message: string }) => {
        console.error('Workflow error:', error);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Workflow error: ${error.message}`,
            timestamp: Date.now(),
          },
        ]);
        setWorkflowProgress(null);
      });

      workflowCleanupRef.current = () => {
        unsubMatched();
        unsubProgress();
        unsubOutput();
        unsubError();
      };
    }
  };

  const scheduledCleanupRef = useRef<(() => void) | null>(null);

  const setupScheduledListeners = () => {
    if (window.electronAPI && window.electronAPI.scheduled) {
      const unsubMessage = window.electronAPI.scheduled.onMessage((message: any) => {
        console.log('Received scheduled task message:', message);
        // Add the message to the chat
        setMessages((prev) => [...prev, message]);
        // Also save to session if there's an active session
        if (currentSessionId) {
          if (window.electronAPI && window.electronAPI.sessions) {
            window.electronAPI.sessions.append(currentSessionId, message);
          }
        }
      });

      scheduledCleanupRef.current = () => {
        unsubMessage();
      };
    }
  };

  const channelsCleanupRef = useRef<(() => void) | null>(null);

  const setupChannelsListeners = () => {
    if (window.electronAPI && window.electronAPI.channels) {
      const unsubAutoReply = window.electronAPI.channels.onAutoReply(
        async (data: { sessionId: string; channelId: string; peerId: string }) => {
          console.log('Received channel auto-reply request:', data);

          try {
            // Load the session associated with this channel/peer
            const session = await window.electronAPI.sessions.get(data.sessionId);
            if (session) {
              // Switch to this session
              setCurrentSessionId(data.sessionId);
              setMessages(session.messages || []);

              // Get the last message (should be the user's message from the channel)
              const lastMessage = session.messages?.[session.messages.length - 1];
              if (lastMessage && lastMessage.role === 'user') {
                // Trigger AI response
                // Store channel info for sending the response back
                sessionStorage.setItem(
                  'currentChannelInfo',
                  JSON.stringify({
                    channelId: data.channelId,
                    peerId: data.peerId,
                  })
                );

                // Trigger the normal chat flow
                const userMessageObj: Message = {
                  role: 'user',
                  content: lastMessage.content,
                  timestamp: Date.now(),
                };

                // Use the existing chat flow
                proceedWithNormalChat(lastMessage.content, userMessageObj, session.messages || []);
              }
            }
          } catch (error) {
            console.error('Failed to handle channel auto-reply:', error);
          }
        }
      );

      channelsCleanupRef.current = () => {
        unsubAutoReply();
      };
    }
  };

  const loadModels = async () => {
    try {
      if (window.electronAPI) {
        const modelsList = await window.electronAPI.models.list();
        setModels(modelsList);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadSessions = async () => {
    try {
      if (window.electronAPI) {
        const sessionsList = await window.electronAPI.sessions.list();
        setSessions(sessionsList);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadWorkflows = async () => {
    try {
      if (window.electronAPI) {
        const workflowsList = await window.electronAPI.workflows.list();
        setWorkflows(workflowsList);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };

  const loadTools = async () => {
    try {
      if (window.electronAPI) {
        const toolsList = await window.electronAPI.tools.list();
        // Convert object to array format
        const toolsArray = Object.entries(toolsList || {}).map(([name, tool]: [string, any]) => ({
          name,
          description: tool.description || '',
          parameters: tool.parameters || {},
        }));
        setAvailableTools(toolsArray);
        // Select all tools by default
        setSelectedTools(toolsArray.map((t) => t.name));
      }
    } catch (error) {
      console.error('Failed to load tools:', error);
    }
  };

  const loadQuickChatSettings = async () => {
    try {
      if (window.electronAPI) {
        // Fetch tools and config in parallel
        const [config, toolsResult] = await Promise.all([
          window.electronAPI.quickChat.getFullConfig(),

          window.electronAPI.tools.list(),
        ]);

        if (config.settings.agentId) {
          setQuickChatAgent({
            id: config.settings.agentId,
            name: config.agentInfo?.name || 'Quick Chat Agent',
          });
        }

        // Get all available tool names
        const toolsArray = Object.entries(toolsResult || {}).map(([name]: [string, any]) => name);

        // Load selected tools from Quick Chat settings
        // Default to all available tools if none saved (Quick Chat mode should always have tools enabled)
        const savedTools = config.settings.selectedTools as string[] | undefined;
        if (savedTools && savedTools.length > 0) {
          // Filter to only include tools that still exist
          const validTools = savedTools.filter((t) => toolsArray.includes(t));
          setQuickChatSelectedTools(new Set(validTools));
        } else {
          // Default to all available tools for Quick Chat
          setQuickChatSelectedTools(new Set(toolsArray));
        }
      }
    } catch (error) {
      console.error('Failed to load Quick Chat settings:', error);
    }
  };

  const loadSkills = async () => {
    try {
      if (window.electronAPI) {
        const skillsList = await window.electronAPI.skills.enabled();
        setSkills(skillsList.filter((s: Skill) => s.enabled !== false));
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  };

  /**
   * Find matching skills based on user input
   */
  const findMatchingSkills = (userInput: string): SkillSuggestion[] => {
    if (!skillsEnabled || !skills || skills.length === 0) return [];

    const input = userInput.toLowerCase();
    const suggestions: SkillSuggestion[] = [];

    for (const skill of skills) {
      let matchScore = 0;
      const matchedTriggers: string[] = [];

      // Check triggers
      if (skill.metadata_json?.triggers) {
        for (const trigger of skill.metadata_json.triggers) {
          if (input.includes(trigger.toLowerCase())) {
            matchScore += 10;
            matchedTriggers.push(trigger);
          }
        }
      }

      // Check domain
      if (skill.metadata_json?.domain && input.includes(skill.metadata_json.domain.toLowerCase())) {
        matchScore += 5;
      }

      // Check description
      if (
        skill.description &&
        input.split(' ').some((word) => skill.description!.toLowerCase().includes(word))
      ) {
        matchScore += 2;
      }

      // Check name
      if (
        skill.name
          .toLowerCase()
          .split('-')
          .some((part) => input.includes(part))
      ) {
        matchScore += 3;
      }

      if (matchScore > 0) {
        suggestions.push({
          skill,
          matchScore,
          matchedTriggers,
        });
      }
    }

    // Sort by match score and return top 3
    return suggestions.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
  };

  /**
   * Execute a selected skill with progress updates
   */
  const executeSkill = async (skill: Skill, inputParams?: Record<string, unknown>) => {
    setSkillExecuting(true);

    try {
      if (window.electronAPI) {
        // Add skill execution start message
        const startMessage: Message = {
          role: 'system',
          content: `⚡ Executing skill: ${skill.name}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, startMessage]);

        // Set up progress listener

        const unsubscribe = window.electronAPI.skills.onProgress(({ skillId, progress }) => {
          if (skillId === skill.id) {
            const progressMessage: Message = {
              role: 'system',
              content: `  ${getProgressIcon(progress.type)} ${progress.message}`,
              timestamp: Date.now(),
            };
            setMessages((prev) => {
              // Avoid duplicate messages
              const lastMessage = prev[prev.length - 1];
              if (
                lastMessage?.role === 'system' &&
                lastMessage.content === progressMessage.content
              ) {
                return prev;
              }
              return [...prev, progressMessage];
            });
          }
        });

        // Execute the skill

        const result = await window.electronAPI.skills.executeWithProgress(skill.id, {
          input: inputParams || { input: input }, // Pass current input as context
          timeout: 120000, // 2 minutes for skills
        });

        unsubscribe();

        // Add result message
        const resultMessage: Message = {
          role: result.success ? 'assistant' : 'tool_error',
          content: result.success
            ? `✓ Skill executed successfully in ${result.executionTime}ms\n\n${formatSkillOutput(result.output)}`
            : `✗ Skill execution failed: ${result.error}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, resultMessage]);
      }
    } catch (error) {
      console.error('Failed to execute skill:', error);
      const errorMessage: Message = {
        role: 'tool_error',
        content: `✗ Failed to execute skill: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSkillExecuting(false);
    }
  };

  /**
   * Get icon for progress type
   */
  const getProgressIcon = (type: string): string => {
    switch (type) {
      case 'start':
        return '🚀';
      case 'info':
        return 'ℹ️';
      case 'progress':
        return '⏳';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'complete':
        return '✅';
      case 'output':
        return '📄';
      default:
        return '•';
    }
  };

  /**
   * Format skill output for display
   */
  const formatSkillOutput = (output: unknown): string => {
    if (typeof output === 'string') {
      return output;
    }
    if (typeof output === 'object' && output !== null) {
      try {
        return JSON.stringify(output, null, 2);
      } catch {
        return String(output);
      }
    }
    return String(output);
  };

  const loadWorkDirectory = async () => {
    try {
      if (window.electronAPI) {
        const workDir = await window.electronAPI.settings.get('workDirectory');
        setWorkDirectory(workDir || `Default: ~/DeskClawProjects`);
      }
    } catch (error) {
      console.error('Failed to load work directory:', error);
    }
  };

  const handleSetWorkDirectory = async () => {
    try {
      if (window.electronAPI && newWorkDir) {
        await window.electronAPI.settings.set('workDirectory', newWorkDir);
        setWorkDirectory(newWorkDir);
        setShowWorkDirDialog(false);
        setNewWorkDir('');
      }
    } catch (error) {
      console.error('Failed to set work directory:', error);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      if (window.electronAPI) {
        const session = await window.electronAPI.sessions.get(sessionId);
        setMessages(session.messagesJson || []);
        setCurrentSessionId(sessionId);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  // Handle loading scheduled task session
  useEffect(() => {
    const scheduledSessionId = sessionStorage.getItem('scheduledSessionId');
    if (scheduledSessionId) {
      // Clear storage
      sessionStorage.removeItem('scheduledSessionId');
      // Load session with a delay
      setTimeout(() => {
        loadSession(scheduledSessionId);
      }, 100);
    }
  }, [loadSession]);

  const createNewSession = async () => {
    try {
      if (window.electronAPI) {
        const session = await window.electronAPI.sessions.create({
          title: 'New Chat',
          messages: [],
        });
        setCurrentSessionId(session.id);
        setMessages([]);
        await loadSessions();
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Delete this conversation?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.sessions.delete(sessionId);
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
        await loadSessions();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
    setContextMenu(null);
  };

  const clearAllSessions = async () => {
    if (!confirm('Are you sure you want to delete ALL conversations? This cannot be undone.'))
      return;

    try {
      if (window.electronAPI) {
        // Delete all sessions
        for (const session of sessions) {
          await window.electronAPI.sessions.delete(session.id);
        }
        setCurrentSessionId(null);
        setMessages([]);
        await loadSessions();
      }
    } catch (error) {
      console.error('Failed to clear sessions:', error);
    }
    setContextMenu(null);
  };

  const copyMessage = async (content: string, messageId: string) => {
    try {
      // Try using window.electronAPI clipboard first (for Electron)
      if (window.electronAPI && (window.electronAPI as any).clipboard) {
        await (window.electronAPI as any).clipboard.writeText(content);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
        return;
      }

      // Fallback to navigator.clipboard (for web browsers)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
        return;
      }

      // Fallback to document.execCommand (deprecated but works in more contexts)
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } else {
        throw new Error('Copy failed');
      }
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard. Please try again.');
    }
  };

  const copyAllConversation = async () => {
    const conversationText = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        const role = m.role === 'user' ? 'You' : 'AI';
        return `${role}:\n${m.content}`;
      })
      .join('\n\n---\n\n');

    try {
      // Try using window.electronAPI clipboard first (for Electron)
      if (window.electronAPI && (window.electronAPI as any).clipboard) {
        await (window.electronAPI as any).clipboard.writeText(conversationText);
        alert('Conversation copied to clipboard!');
        return;
      }

      // Fallback to navigator.clipboard (for web browsers)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(conversationText);
        alert('Conversation copied to clipboard!');
        return;
      }

      // Fallback to document.execCommand (deprecated but works in more contexts)
      const textArea = document.createElement('textarea');
      textArea.value = conversationText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        alert('Conversation copied to clipboard!');
      } else {
        throw new Error('Copy failed');
      }
    } catch (error) {
      console.error('Failed to copy conversation:', error);
      alert('Failed to copy conversation. Please try again.');
    }
  };

  const copySession = async (sessionId: string) => {
    try {
      if (window.electronAPI) {
        const session = await window.electronAPI.sessions.get(sessionId);
        if (session && session.messages) {
          const conversationText = session.messages
            .filter((m: Message) => m.role === 'user' || m.role === 'assistant')
            .map((m: Message) => {
              const role = m.role === 'user' ? 'You' : 'AI';
              return `${role}:\n${m.content}`;
            })
            .join('\n\n---\n\n');

          await navigator.clipboard.writeText(conversationText);
          alert('Conversation copied to clipboard!');
        }
      }
    } catch (error) {
      console.error('Failed to copy session:', error);
    }
    setContextMenu(null);
  };

  const saveMessages = useCallback(
    async (msgs: Message[]) => {
      if (!currentSessionId) return;

      try {
        if (window.electronAPI) {
          await window.electronAPI.sessions.update(currentSessionId, {
            messages: msgs,
            title: msgs.length > 0 ? msgs[0].content.slice(0, 50) : 'New Chat',
          });
        }
      } catch (error) {
        console.error('Failed to save messages:', error);
      }
    },
    [currentSessionId]
  );

  const handleSend = async () => {
    if (!input.trim() || isLoading || !selectedModel) return;

    const userMessage = input;
    const userMessageObj: Message = {
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };

    // Track chat event for evolution learning
    window.electronAPI?.evolution?.trackEvent?.('chat_message', {
      messageLength: userMessage.length,
      modelId: selectedModel,
    });

    // Visible messages (without tools system message)
    const visibleMessages = [...messages, userMessageObj];
    setMessages(visibleMessages);
    setInput('');
    setIsLoading(true);
    setWorkflowMatchPreview(null); // Clear previous preview
    setWorkflowProgress(null); // Clear previous progress
    lastExecutedToolRef.current = null; // Reset last executed tool tracking

    // Check for auto-workflow match
    if (autoWorkflowEnabled) {
      try {
        if (window.electronAPI && window.electronAPI.workflows) {
          const preview = await window.electronAPI.workflows.autoPreview(userMessage);
          if (preview.matched && preview.workflow) {
            setWorkflowMatchPreview({
              workflowId: preview.workflow.id,
              workflowName: preview.workflow.name,
              confidence: preview.workflow.confidence,
            });

            // Auto-execute the workflow
            setWorkflowProgress({
              workflowName: preview.workflow.name,
              currentNode: 'Starting...',
              status: 'Initializing',
              output: [],
            });

            // Create session if needed
            if (!currentSessionId) {
              const session = await window.electronAPI.sessions.create({
                title: userMessage.slice(0, 50),
                messages: visibleMessages,
              });
              setCurrentSessionId(session.id);
              await loadSessions();
            } else {
              await saveMessages(visibleMessages);
            }

            // Execute workflow

            const result = await window.electronAPI.workflows.autoExecute({
              userMessage,
              modelId: selectedModel,
            });

            setWorkflowProgress(null);

            if (result.matched && result.result) {
              // Workflow completed successfully
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: `Workflow "${result.workflowName}" completed successfully.`,
                  timestamp: Date.now(),
                },
              ]);

              // Save to session
              if (currentSessionId) {
                await saveMessages([
                  ...visibleMessages,
                  {
                    role: 'assistant',
                    content: `Workflow "${result.workflowName}" completed successfully.`,
                    timestamp: Date.now(),
                  },
                ]);
              }
            } else if (!result.matched) {
              // No workflow matched, fall back to normal chat
              proceedWithNormalChat(userMessage, userMessageObj, visibleMessages);
            }

            setIsLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error('Auto-workflow error:', error);
        setWorkflowMatchPreview(null);
      }
    }

    // No workflow match or auto-workflow disabled, proceed with normal chat
    proceedWithNormalChat(userMessage, userMessageObj, visibleMessages);
  };

  const proceedWithNormalChat = async (
    userMessage: string,
    userMessageObj: Message,
    visibleMessages: Message[]
  ) => {
    // Messages for LLM (including tools system message if tools enabled)
    // Apply context control to prevent token overflow
    let llmMessages = truncateMessagesForLLM([...messages, userMessageObj], 80000);

    // Use Quick Chat tools if available, otherwise use regular tools
    // Quick Chat mode: Always use tools (defaults to all available tools)
    // Regular chat mode: Use tools only when toolsEnabled is true
    const useQuickChatTools = quickChatAgent || quickChatSelectedTools.size > 0;
    const toolsToUse = useQuickChatTools ? Array.from(quickChatSelectedTools) : selectedTools;
    const shouldUseTools = useQuickChatTools ? true : toolsEnabled && selectedTools.length > 0;

    if (shouldUseTools && toolsToUse.length > 0) {
      const toolsInfo = toolsToUse
        .map((toolName) => {
          // Handle both array and object formats for availableTools
          let tool;
          if (Array.isArray(availableTools)) {
            tool = availableTools.find((t: any) => t.name === toolName);
          } else {
            tool = (availableTools as any)[toolName];
          }
          return `- ${toolName}: ${tool?.description || toolName}`;
        })
        .join('\n');

      const toolsMessage: Message = {
        role: 'system',
        content: `You have access to the following tools:\n${toolsInfo}\n\n## IMPORTANT: Tool Calling Rules

1. When you need to use a tool, respond ONLY with a JSON object in this EXACT format:
{"tool": "tool_name", "parameters": {"param": "value"}}

2. Do NOT use any other format. Do NOT wrap in code blocks. Do NOT add explanations before or after the JSON.

3. Available tool names (use EXACTLY these names):
   - file_read: Read file content
   - file_write: Write content to file
   - file_list: List directory contents
   - execute_command: Run shell commands (requires approval)
   - web_search: Search the web
   - http_request: Make HTTP requests
   - get_time: Get current time
   - set_work_directory: Set working directory for file operations
   - get_work_directory: Get current working directory
   - scheduled_create: Create scheduled tasks (timers, recurring tasks)
   - scheduled_list: List all scheduled tasks
   - scheduled_delete: Delete a scheduled task
   - stock_quote: Get real-time stock market data from Yahoo Finance (use for stock queries)

4. STOCK MARKET QUERIES - IMPORTANT: When user asks about stocks, indices, or market data:
   - ALWAYS use stock_quote tool (NOT browser_navigate or web_search)
   - Common indices: ^GSPC (S&P 500), ^DJI (Dow Jones), ^IXIC (NASDAQ), ^HSI (Hang Seng)
   - Chinese stocks: 000001.SS (Shanghai), 399001.SZ (Shenzhen)
   - Format: {"tool": "stock_quote", "parameters": {"symbol": "AAPL"}} or {"symbols": "^GSPC,^DJI"}
   - For stock queries, NEVER use browser_navigate or web_search first

5. SCHEDULED TASKS - IMPORTANT: When user mentions time-based requests like:
   - "X秒后" (after X seconds) → ONE-TIME task, set one_time: true
   - "X分钟后" (after X minutes) → ONE-TIME task, set one_time: true
   - "每天X点" (every day at X) → RECURRING task, set one_time: false
   - "每隔X秒" (every X seconds) → RECURRING task, set one_time: false
   - "定时发送" (send on schedule) → depends on context
   - "提醒我" (remind me) → usually ONE-TIME task

   Cron format for scheduled_create:
   - "*/10 * * * * *" = every 10 seconds
   - "0 * * * * *" = every minute
   - "0 */5 * * * *" = every 5 minutes
   - "0 0 * * * *" = every hour

   Parameters:
   - name: unique task name
   - type: "prompt" for AI tasks, "reminder" for notifications
   - cron_expression: cron schedule
   - task_config: {"prompt": "the task to do"} for prompt type
   - one_time: true for one-time tasks (like "10秒后"), false for recurring (like "每天")

5. Example - User says "10秒后帮我在对话框中发送一个信息，让AI帮我开发扫雷游戏":
{"tool": "scheduled_create", "parameters": {"name": "minesweeper_reminder", "type": "prompt", "cron_expression": "*/10 * * * * *", "task_config": {"prompt": "帮我开发扫雷游戏"}, "one_time": true}}

6. Example - To create a directory and write a file:
{"tool": "set_work_directory", "parameters": {"path": "D:\\\\MyProjects"}}
{"tool": "execute_command", "parameters": {"command": "mkdir BubbleDragonGame"}}
{"tool": "file_write", "parameters": {"filepath": "BubbleDragonGame/index.html", "content": "<html>...</html>"}}

7. For Windows paths, use double backslashes: "D:\\\\MyProjects\\\\MyProject"
8. After each tool call, you will receive the result and can continue with more actions.`,
        timestamp: Date.now(),
      };

      llmMessages = [...llmMessages, toolsMessage];
    }

    if (!currentSessionId) {
      if (window.electronAPI) {
        const session = await window.electronAPI.sessions.create({
          title: userMessage.slice(0, 50),
          messages: visibleMessages, // Only save visible messages
        });
        setCurrentSessionId(session.id);
        await loadSessions();
      }
    } else {
      await saveMessages(visibleMessages); // Only save visible messages
    }

    try {
      if (window.electronAPI) {
        // Use Quick Chat API if Quick Chat agent is selected OR Quick Chat tools are configured
        const useQuickChatAPI = quickChatAgent || quickChatSelectedTools.size > 0;
        if (useQuickChatAPI) {
          await window.electronAPI.quickChat.stream({
            model: selectedModel,
            messages: llmMessages, // Send all messages including tools system message
          });
        } else {
          await window.electronAPI.llm.stream({
            model: selectedModel,
            messages: llmMessages, // Send all messages including tools system message
          });
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    }
  };

  const executeTool = async (toolName: string, parameters: Record<string, unknown>) => {
    // Add tool call message
    const toolMessage: Message = {
      role: 'tool',
      content: `Calling ${toolName} with ${JSON.stringify(parameters)}`,
      timestamp: Date.now(),
      toolName,
    };
    setMessages((prev) => [...prev, toolMessage]);

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.tools.execute(toolName, parameters);

        if (result.error) {
          const errorMessage: Message = {
            role: 'tool_error',
            content: `Error in ${toolName}: ${result.error}`,
            timestamp: Date.now(),
            toolName,
          };
          setMessages((prev) => [...prev, errorMessage]);
        } else {
          const successMessage: Message = {
            role: 'tool_result',
            content: `${toolName} result:\n${JSON.stringify(result.result, null, 2)}`,
            timestamp: Date.now(),
            toolName,
          };
          setMessages((prev) => [...prev, successMessage]);

          // Save to session
          if (currentSessionId) {
            await saveMessages([...messages, toolMessage, successMessage]);
          }
        }
      }
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'tool_error',
        content: `Failed to execute ${toolName}: ${error.message}`,
        timestamp: Date.now(),
        toolName,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const executeToolAsync = async (
    toolName: string,
    parameters: Record<string, unknown>,
    currentMessages: Message[]
  ) => {
    console.log('executeToolAsync called:', { toolName, parameters });

    // Add tool call message
    const toolMessage: Message = {
      role: 'tool',
      content: `Calling ${toolName} with ${JSON.stringify(parameters)}`,
      timestamp: Date.now(),
      toolName,
    };
    const messagesWithTool = [...currentMessages, toolMessage];
    setMessages(messagesWithTool);

    try {
      if (window.electronAPI) {
        console.log('Executing tool via electronAPI...');

        const result = await window.electronAPI.tools.execute(toolName, parameters);
        console.log('Tool execution result:', result);

        let resultMessage: Message;
        if (result.error) {
          // Provide helpful error message with suggestions
          let errorContent = `Error in ${toolName}: ${result.error}\n\n`;

          // Add helpful suggestions based on the error
          if (result.error.includes('not found')) {
            errorContent += `Available tools: file_read, file_write, file_list, execute_command, web_search, http_request, get_time, set_work_directory, get_work_directory, scheduled_create, scheduled_list, scheduled_delete, scheduled_update, stock_quote\n`;
            errorContent += `Please check the tool name and try again with the correct name.`;
          } else if (result.error.includes('Directory does not exist')) {
            errorContent += `Suggestion: Use execute_command with "mkdir <directory>" to create the directory first, or use an existing directory.`;
          } else if (result.error.includes('Failed to read file')) {
            errorContent += `Suggestion: Check if the file path is correct. Use file_list to see available files.`;
          } else if (result.error.includes('Failed to write file')) {
            errorContent += `Suggestion: Make sure the parent directory exists. Use execute_command with "mkdir" to create directories.`;
          }

          resultMessage = {
            role: 'tool_error',
            content: errorContent,
            timestamp: Date.now(),
            toolName,
          };
        } else {
          // Format result with length control
          let resultContent = '';
          const resultStr = JSON.stringify(result.result, null, 2);

          // Limit result display to prevent UI issues
          const maxDisplayLength = 50000; // 50KB for display
          if (resultStr.length > maxDisplayLength) {
            resultContent = `Tool result (truncated, ${resultStr.length} chars total):\n${resultStr.substring(0, maxDisplayLength)}\n\n... (${resultStr.length - maxDisplayLength} more characters)`;
          } else {
            resultContent = `Tool result:\n${resultStr}`;
          }

          resultMessage = {
            role: 'tool_result',
            content: resultContent,
            timestamp: Date.now(),
            toolName,
          };
        }

        const messagesWithResult = [...messagesWithTool, resultMessage];
        setMessages(messagesWithResult);
        console.log('Messages updated with tool result');

        // Save to session (only save visible messages, exclude tool messages)
        const visibleMessages = messagesWithResult.filter(
          (m) => m.role !== 'tool' && m.role !== 'tool_result' && m.role !== 'tool_error'
        );
        if (currentSessionId) {
          await saveMessages(visibleMessages);
        }

        // Continue the conversation by sending the result back to the AI
        console.log('Continuing conversation with AI...');
        console.log('Current selectedModel (ref):', selectedModelRef.current);

        // Validate model before calling LLM
        const modelToUse = selectedModelRef.current;
        if (!modelToUse) {
          console.error('No model selected, trying to use first available model');
          if (models.length > 0) {
            const firstModel = models[0].id;
            console.log('Using first available model:', firstModel);
            setSelectedModel(firstModel);
            selectedModelRef.current = firstModel;
          } else {
            throw new Error('No models available. Please add a model in Settings.');
          }
        }

        // Prepare messages for LLM (include tools system message if tools are enabled)
        let llmMessages = [...messagesWithResult];
        if (toolsEnabledRef.current && selectedToolsRef.current.length > 0) {
          // Add tools system message before sending to LLM
          const toolsInfo = selectedToolsRef.current
            .map((toolName) => {
              // Handle both array and object formats for availableTools
              let tool;
              if (Array.isArray(availableTools)) {
                tool = availableTools.find((t: any) => t.name === toolName);
              } else {
                tool = (availableTools as any)[toolName];
              }
              return `- ${toolName}: ${tool?.description || toolName}`;
            })
            .join('\n');

          const toolsMessage: Message = {
            role: 'system',
            content: `You have access to the following tools:\n${toolsInfo}\n\n## IMPORTANT: Tool Calling Rules

1. When you need to use a tool, respond ONLY with a JSON object in this EXACT format:
{"tool": "tool_name", "parameters": {"param": "value"}}

2. Do NOT use any other format. Do NOT wrap in code blocks. Do NOT add explanations before or after the JSON.

3. Available tool names (use EXACTLY these names):
   - file_read: Read file content
   - file_write: Write content to file
   - file_list: List directory contents
   - execute_command: Run shell commands (requires approval)
   - web_search: Search the web
   - http_request: Make HTTP requests
   - get_time: Get current time
   - set_work_directory: Set working directory for file operations
   - get_work_directory: Get current working directory
   - scheduled_create: Create scheduled tasks (timers, recurring tasks)
   - scheduled_list: List all scheduled tasks
   - scheduled_delete: Delete a scheduled task
   - stock_quote: Get real-time stock market data from Yahoo Finance (use for stock queries)

4. STOCK MARKET QUERIES - IMPORTANT: When user asks about stocks, indices, or market data:
   - ALWAYS use stock_quote tool (NOT browser_navigate or web_search)
   - Common indices: ^GSPC (S&P 500), ^DJI (Dow Jones), ^IXIC (NASDAQ), ^HSI (Hang Seng)
   - Chinese stocks: 000001.SS (Shanghai), 399001.SZ (Shenzhen)
   - Format: {"tool": "stock_quote", "parameters": {"symbol": "AAPL"}} or {"symbols": "^GSPC,^DJI"}
   - For stock queries, NEVER use browser_navigate or web_search first

5. SCHEDULED TASKS - IMPORTANT: When user mentions time-based requests like:
   - "X秒后" (after X seconds) → ONE-TIME task, set one_time: true
   - "X分钟后" (after X minutes) → ONE-TIME task, set one_time: true
   - "每天X点" (every day at X) → RECURRING task, set one_time: false
   - "每隔X秒" (every X seconds) → RECURRING task, set one_time: false
   - "定时发送" (send on schedule) → depends on context
   - "提醒我" (remind me) → usually ONE-TIME task

   Cron format for scheduled_create:
   - "*/10 * * * * *" = every 10 seconds
   - "0 * * * * *" = every minute
   - "0 */5 * * * *" = every 5 minutes
   - "0 0 * * * *" = every hour

   Parameters:
   - name: unique task name
   - type: "prompt" for AI tasks, "reminder" for notifications
   - cron_expression: cron schedule
   - task_config: {"prompt": "the task to do"} for prompt type
   - one_time: true for one-time tasks (like "10秒后"), false for recurring (like "每天")

5. Example - User says "10秒后帮我在对话框中发送一个信息，让AI帮我开发扫雷游戏":
{"tool": "scheduled_create", "parameters": {"name": "minesweeper_reminder", "type": "prompt", "cron_expression": "*/10 * * * * *", "task_config": {"prompt": "帮我开发扫雷游戏"}, "one_time": true}}

6. Example - To create a directory and write a file:
{"tool": "set_work_directory", "parameters": {"path": "D:\\\\MyProjects"}}
{"tool": "execute_command", "parameters": {"command": "mkdir BubbleDragonGame"}}
{"tool": "file_write", "parameters": {"filepath": "BubbleDragonGame/index.html", "content": "<html>...</html>"}}

7. For Windows paths, use double backslashes: "D:\\\\MyProjects\\\\MyProject"
8. After each tool call, you will receive the result and can continue with more actions.`,
            timestamp: Date.now(),
          };

          // Add tools system message at the end (before the tool result)
          // Apply context control to prevent token overflow
          llmMessages = truncateMessagesForLLM(
            [...messagesWithTool, toolsMessage, resultMessage],
            80000
          );
          console.log('Added tools system message to LLM request');
        } else {
          // Apply context control even without tools
          llmMessages = truncateMessagesForLLM(messagesWithResult, 80000);
        }

        console.log(
          'Sending messages to LLM:',
          llmMessages.map((m) => ({ role: m.role, content: m.content.substring(0, 50) }))
        );

        setIsLoading(true);
        // Reset the processing flag for the new stream
        processingDoneRef.current = false;

        // Add timeout to prevent hanging
        const timeoutId = setTimeout(() => {
          console.error('LLM stream timeout - no response after 60 seconds');
          setIsLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'Error: Request timed out. The AI did not respond within 60 seconds.',
              timestamp: Date.now(),
            },
          ]);
        }, 60000);

        try {
          await window.electronAPI.llm.stream({
            model: modelToUse || models[0]?.id,
            messages: llmMessages,
          });
          clearTimeout(timeoutId);
          console.log('Stream request sent to AI');
        } catch (streamError) {
          clearTimeout(timeoutId);
          console.error('Error calling LLM stream:', streamError);
          setIsLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Error: Failed to get AI response - ${streamError instanceof Error ? streamError.message : 'Unknown error'}`,
              timestamp: Date.now(),
            },
          ]);
        }
      }
    } catch (error: any) {
      console.error('Error in executeToolAsync:', error);
      const errorMessage: Message = {
        role: 'tool_error',
        content: `Failed to execute ${toolName}: ${error.message}`,
        timestamp: Date.now(),
        toolName,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  // Listen for tool execution requests from the main process
  const executeToolManually = async (tool: Tool) => {
    setSelectedToolForDialog(tool);
    setToolParams({});
    setShowToolDialog(true);
  };

  const handleExecuteTool = async () => {
    if (!selectedToolForDialog) return;

    const toolMessage: Message = {
      role: 'tool',
      content: `Calling ${selectedToolForDialog.name} with ${JSON.stringify(toolParams, null, 2)}`,
      timestamp: Date.now(),
      toolName: selectedToolForDialog.name,
    };

    setMessages((prev) => [...prev, toolMessage]);
    setShowToolDialog(false);

    // Execute the tool
    await executeTool(selectedToolForDialog.name, toolParams);
  };

  // Listen for tool execution requests from the main process
  useEffect(() => {
    const handleToolRequest = (
      _event: any,
      request: { toolName: string; parameters: Record<string, unknown> }
    ) => {
      executeTool(request.toolName, request.parameters);
    };

    if (window.electronAPI) {
      const unsub = window.electronAPI.shell.onApprovalRequest(handleToolRequest);
      return () => unsub();
    }
    return undefined;
  }, [messages, currentSessionId]);

  const handleOpenWorkflowDialog = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setWorkflowParams({});
    setShowWorkflowDialog(true);
  };

  const handleExecuteWorkflow = async () => {
    if (!selectedWorkflow) return;

    setIsExecutingWorkflow(true);

    // Add a user message with the workflow content
    let userContent = '';
    if (selectedWorkflow.name.includes('Code') && workflowParams.code) {
      userContent = `Please review this code:\n\n${workflowParams.code}`;
    } else if (selectedWorkflow.name.includes('Error') && workflowParams.error) {
      userContent = `Help me debug this error:\n\n${workflowParams.error}`;
    } else if (selectedWorkflow.name.includes('Research') && workflowParams.topic) {
      userContent = `Research topic: ${workflowParams.topic}`;
      if (workflowParams.areas) userContent += `\nFocus areas: ${workflowParams.areas}`;
      if (workflowParams.depth) userContent += `\nDepth: ${workflowParams.depth}`;
    } else if (selectedWorkflow.name.includes('API') && workflowParams.endpoint) {
      userContent = `Build an API request for:\nEndpoint: ${workflowParams.endpoint}\nMethod: ${workflowParams.method || 'GET'}`;
    } else if (selectedWorkflow.name.includes('Daily') && workflowParams.notes) {
      userContent = `Daily summary:\n\n${workflowParams.notes}`;
    } else if (workflowParams.input) {
      userContent = workflowParams.input;
    }

    // Add workflow execution notification
    const workflowMessage: Message = {
      role: 'system',
      content: `🔄 Running workflow: ${selectedWorkflow.name}`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, workflowMessage]);

    // If we have parameters to send, also send them as a user message
    if (userContent) {
      const userMessage: Message = {
        role: 'user',
        content: userContent,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Use the selected model for a simple chat instead of executing the workflow
      // This provides a better UX for quick workflows
      try {
        if (window.electronAPI) {
          const newMessages = [...messages, workflowMessage, userMessage];
          setIsLoading(true);

          await window.electronAPI.llm.stream({
            model: workflowParams.modelId || selectedModel,
            messages: newMessages,
          });
        }
      } catch (error) {
        console.error('Failed to execute workflow:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: `❌ Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
      }

      setShowWorkflowDialog(false);
      return;
    }

    // For workflows without specific parameters, execute the full workflow
    try {
      if (window.electronAPI) {
        const result: WorkflowExecutionResult = await window.electronAPI.workflows.execute(
          selectedWorkflow.id
        );

        if (result.success) {
          // Format the workflow results into a readable message
          let resultContent = `✅ Workflow completed: ${selectedWorkflow.name}\n\n`;

          for (const [_nodeId, nodeResult] of Object.entries(result.results)) {
            if (typeof nodeResult === 'object' && nodeResult !== null) {
              const resultData = nodeResult as { result?: unknown; skipped?: boolean };
              if (resultData.skipped) {
                continue;
              }
              if (resultData.result && typeof resultData.result === 'object') {
                const typed = resultData.result as { type?: string; content?: string };
                if (typed.type === 'llm' && typed.content) {
                  resultContent += `\n${typed.content}`;
                }
              }
            }
          }

          const assistantMessage: Message = {
            role: 'assistant',
            content: resultContent,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMessage]);

          // Save to session if exists
          if (currentSessionId) {
            await saveMessages([...messages, workflowMessage, assistantMessage]);
          }
        } else {
          const errorMessage: Message = {
            role: 'assistant',
            content: `❌ Workflow failed: ${result.error || 'Unknown error'}`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }

        setShowWorkflowDialog(false);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: `❌ Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsExecutingWorkflow(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const groupedModels = models.reduce((acc: Record<string, Model[]>, model: Model) => {
    const key = model.is_custom ? 'Custom Models' : 'Built-in Models';
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});

  return (
    <>
      <AppShell>
        <div className="flex h-full gap-4">
          {/* Sessions Sidebar */}
          <div className="w-64 flex-shrink-0 border-r pr-4 hidden md:block">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">Conversations</h2>
              <div className="flex gap-1">
                {sessions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllSessions}
                    className="h-7 w-7 p-0 hover:bg-destructive/90 hover:text-destructive-foreground"
                    title="Delete all conversations"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={createNewSession}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative flex items-center gap-2 rounded-lg p-2 pr-16 cursor-pointer hover:bg-accent ${
                      currentSessionId === session.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => loadSession(session.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        sessionId: session.id,
                      });
                    }}
                  >
                    <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate flex-1" title={session.title}>
                      {session.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0 absolute right-8 opacity-100 hover:bg-destructive/90 hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No conversations yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Main Chat Area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold">Quick Chat</h1>
                  <QuickChatAgentSelector
                    variant="compact"
                    showStats={false}
                    onAgentChange={async (agentId) => {
                      if (agentId) {
                        // Find agent info
                        const agents = await (
                          window as any
                        ).electronAPI?.quickChat?.getAvailableAgents();
                        const agent = agents?.find((a: any) => a.id === agentId);
                        setQuickChatAgent({
                          id: agentId,
                          name: agent?.name || 'Quick Chat Agent',
                        });
                      } else {
                        setQuickChatAgent(null);
                      }
                      // Reload Quick Chat settings to get selected tools
                      await loadQuickChatSettings();
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <QuickChatSettings
                    onSettingsChange={async () => {
                      await loadQuickChatSettings();
                    }}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Wrench className="w-4 h-4 mr-1" />
                        Settings
                      </Button>
                    }
                  />
                  {models.length > 0 && (
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(groupedModels).map(([group, groupModels]) => (
                          <SelectGroup key={group}>
                            <SelectLabel>{group}</SelectLabel>
                            {(groupModels as Model[]).map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.display_name} ({model.provider_name})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Workflow Quick Actions */}
              {workflows.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Zap className="h-4 w-4" />
                      <span className="font-medium">Quick Workflows</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Auto-workflow toggle */}
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="auto-workflow-toggle"
                          className="text-xs text-muted-foreground"
                        >
                          Auto-detect
                        </label>
                        <button
                          id="auto-workflow-toggle"
                          onClick={() => setAutoWorkflowEnabled(!autoWorkflowEnabled)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            autoWorkflowEnabled ? 'bg-primary' : 'bg-muted-foreground'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              autoWorkflowEnabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {workflows.length} workflows available
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="h-[70px]">
                    <div className="flex gap-1.5 flex-wrap pr-2">
                      {workflows.map((workflow) => (
                        <Button
                          key={workflow.id}
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenWorkflowDialog(workflow)}
                          className="text-xs h-7 px-2 shrink-0 whitespace-nowrap"
                          title={workflow.description || workflow.name}
                        >
                          <Workflow className="h-3 w-3 mr-1" />
                          {workflow.name}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Workflow Match Preview */}
              {workflowMatchPreview && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Workflow Matched</p>
                        <p className="text-xs text-muted-foreground">
                          {workflowMatchPreview.workflowName} (
                          {Math.round(workflowMatchPreview.confidence * 100)}% confidence)
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setWorkflowMatchPreview(null)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              {/* Workflow Progress */}
              {workflowProgress && (
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <p className="text-sm font-medium">{workflowProgress.workflowName}</p>
                    <span className="text-xs text-muted-foreground">•</span>
                    <p className="text-xs text-muted-foreground">{workflowProgress.currentNode}</p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full animate-pulse w-1/2" />
                  </div>
                </div>
              )}
            </div>

            {/* Chat Area */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.length === 0 && !streamingContent ? (
                    <div className="flex h-full items-center justify-center text-center">
                      <div className="max-w-md space-y-2">
                        <h3 className="text-lg font-semibold">Start a conversation</h3>
                        <p className="text-sm text-muted-foreground">
                          Ask me anything. I&apos;m here to help you with tasks, answer questions,
                          and assist with your work.
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.filter(Boolean).map((message, index) => {
                      // System messages (workflow notifications)
                      if (message.role === 'system') {
                        return (
                          <div key={index} className="flex justify-center">
                            <div className="max-w-[80%] rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-2">
                              <p className="text-sm whitespace-pre-wrap text-blue-800 dark:text-blue-200">
                                {message.content}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      // Tool messages
                      if (message.role === 'tool') {
                        return (
                          <div key={index} className="flex justify-start">
                            <div className="max-w-[80%] rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-2">
                              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                                <Wrench className="h-3 w-3" />
                                <span className="text-xs font-medium">Tool Call</span>
                                <span className="text-xs">•</span>
                                <span className="text-xs">{message.toolName}</span>
                              </div>
                              <ScrollArea className="max-h-[100px] mt-1">
                                <p className="text-xs text-purple-600 dark:text-purple-400 px-1">
                                  {message.content}
                                </p>
                              </ScrollArea>
                            </div>
                          </div>
                        );
                      }

                      // Tool Result messages
                      if (message.role === 'tool_result') {
                        return (
                          <div key={index} className="flex justify-start">
                            <div className="max-w-[80%] rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-2">
                              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                                <span className="text-xs font-medium">Tool Result</span>
                                <span className="text-xs">•</span>
                                <span className="text-xs">{message.toolName}</span>
                              </div>
                              <ScrollArea className="max-h-[120px] mt-1">
                                <pre className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap px-1">
                                  {message.content}
                                </pre>
                              </ScrollArea>
                            </div>
                          </div>
                        );
                      }

                      // Tool Error messages
                      if (message.role === 'tool_error') {
                        return (
                          <div key={index} className="flex justify-start">
                            <div className="max-w-[80%] rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2">
                              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                                <span className="text-xs font-medium">Tool Error</span>
                                <span className="text-xs">•</span>
                                <span className="text-xs">{message.toolName}</span>
                              </div>
                              <ScrollArea className="max-h-[100px] mt-1">
                                <p className="text-xs text-red-600 dark:text-red-400 px-1">
                                  {message.content}
                                </p>
                              </ScrollArea>
                            </div>
                          </div>
                        );
                      }

                      // User and Assistant messages
                      return (
                        <div
                          key={index}
                          className={`flex group ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`relative max-w-[85%] rounded-lg px-4 py-2 ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {message.content}
                            </p>
                            {/* Copy button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`absolute top-1 ${
                                message.role === 'user' ? 'left-1' : 'right-1'
                              } h-6 w-6 p-0 opacity-0 group-hover:opacity-100 bg-background/80 hover:bg-background`}
                              onClick={() => copyMessage(message.content, `msg-${index}`)}
                              title="Copy message"
                            >
                              {copiedMessageId === `msg-${index}` ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {streamingContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
                        <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
                      </div>
                    </div>
                  )}
                  {isLoading && !streamingContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 delay-100" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50 delay-200" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t">
                {/* Context Usage Bar */}
                {messages.length > 0 && (
                  <div className="px-4 pt-3 pb-2 border-b">
                    <ContextUsageBar
                      messages={messages}
                      maxTokens={128000}
                      maxChars={100000}
                      onTruncate={() => {
                        // Truncate messages (keep recent ones)
                        const truncateMessagesForLLM = (
                          msgs: Message[],
                          maxTotalChars: number = 80000
                        ): Message[] => {
                          let totalChars = 0;
                          const result: Message[] = [];

                          for (let i = msgs.length - 1; i >= 0; i--) {
                            const msgChars = msgs[i].content.length;
                            if (totalChars + msgChars > maxTotalChars) break;
                            totalChars += msgChars;
                            result.unshift(msgs[i]);
                          }

                          // Always keep the first user message
                          if (
                            msgs.length > 0 &&
                            msgs[0].role === 'user' &&
                            !result.includes(msgs[0])
                          ) {
                            result.unshift(msgs[0]);
                          }

                          return result;
                        };

                        setMessages(truncateMessagesForLLM(messages));
                      }}
                      showWarning={true}
                    />
                  </div>
                )}

                <div className="p-4">
                  {/* Tools Bar */}
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {messages.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyAllConversation}
                          className="text-xs h-7 flex-shrink-0"
                          title="Copy entire conversation"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy All
                        </Button>
                      )}
                      <Button
                        variant={toolsEnabled ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const newEnabled = !toolsEnabled;
                          setToolsEnabled(newEnabled);
                          // Auto-select all tools when enabling
                          if (newEnabled && availableTools.length > 0) {
                            setSelectedTools(availableTools.map((t) => t.name));
                          }
                        }}
                        className="text-xs h-7 flex-shrink-0"
                      >
                        <Wrench className="h-3 w-3 mr-1" />
                        Tools
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowWorkDirDialog(true)}
                        className="text-xs h-7 flex-shrink-0"
                        title={`Current work directory: ${workDirectory}`}
                      >
                        <FolderOpen className="h-3 w-3 mr-1" />
                        Work Dir
                      </Button>
                      {toolsEnabled && availableTools.length > 0 && (
                        <div className="flex gap-1 overflow-x-auto pb-1 flex-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-700">
                          {availableTools.map((tool) => (
                            <div key={tool.name} className="flex gap-0.5 flex-shrink-0">
                              <Button
                                variant={selectedTools.includes(tool.name) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => {
                                  setSelectedTools((prev) =>
                                    prev.includes(tool.name)
                                      ? prev.filter((t) => t !== tool.name)
                                      : [...prev, tool.name]
                                  );
                                }}
                                className="text-xs h-7 px-2 rounded-r-none whitespace-nowrap"
                                title={tool.description}
                              >
                                {tool.name.replace('_', ' ')}
                              </Button>
                              <Button
                                variant={selectedTools.includes(tool.name) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => executeToolManually(tool)}
                                className="text-xs h-7 px-2 rounded-l-none border-l-0"
                                title={`Run ${tool.name}`}
                              >
                                ▶
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedTools.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedTools.length} tool{selectedTools.length > 1 ? 's' : ''} enabled for
                        AI
                      </span>
                    )}
                  </div>

                  {/* Skills toggle */}
                  <div className="flex items-center gap-2 border-t pt-2">
                    <Button
                      variant={skillsEnabled ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSkillsEnabled(!skillsEnabled)}
                      className="w-full justify-start"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Skills {skillsEnabled ? 'On' : 'Off'}
                    </Button>
                    {skillsEnabled && skills.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {skills.length} skill{skills.length > 1 ? 's' : ''} available
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        className="flex-1"
                      />
                      {/* Skill suggestions */}
                      {skillSuggestions.length > 0 && !isLoading && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-lg shadow-lg z-50 p-2">
                          <div className="text-xs text-muted-foreground mb-2 px-2">
                            Suggested Skills
                          </div>
                          {skillSuggestions.map((suggestion) => (
                            <div
                              key={suggestion.skill.id}
                              className="flex items-center justify-between p-2 hover:bg-accent rounded cursor-pointer group"
                              onClick={() => executeSkill(suggestion.skill)}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {suggestion.skill.name}
                                  </span>
                                  {suggestion.skill.metadata_json?.domain && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                                      {suggestion.skill.metadata_json.domain}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                  {suggestion.skill.description}
                                </div>
                                {suggestion.matchedTriggers.length > 0 && (
                                  <div className="flex gap-1 mt-1">
                                    {suggestion.matchedTriggers.map((trigger, i) => (
                                      <span
                                        key={i}
                                        className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                                      >
                                        {trigger}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                disabled={skillExecuting}
                              >
                                <Zap className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppShell>

      {/* Workflow Execution Dialog */}
      <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Workflow: {selectedWorkflow?.name}</DialogTitle>
            <DialogDescription>
              {selectedWorkflow?.description || 'Execute this workflow with custom parameters.'}
            </DialogDescription>
          </DialogHeader>

          {selectedWorkflow && (
            <div className="space-y-4 py-4">
              {/* Parameter inputs based on workflow type */}
              {selectedWorkflow.name.includes('Code') && (
                <div className="space-y-2">
                  <Label htmlFor="workflow-code">Code</Label>
                  <Textarea
                    id="workflow-code"
                    placeholder="Paste your code here..."
                    className="min-h-[120px] font-mono text-sm"
                    value={workflowParams.code || ''}
                    onChange={(e) => setWorkflowParams({ ...workflowParams, code: e.target.value })}
                  />
                </div>
              )}

              {selectedWorkflow.name.includes('Error') && (
                <div className="space-y-2">
                  <Label htmlFor="workflow-error">Error Message</Label>
                  <Textarea
                    id="workflow-error"
                    placeholder="Paste the error message..."
                    className="min-h-[80px] font-mono text-sm"
                    value={workflowParams.error || ''}
                    onChange={(e) =>
                      setWorkflowParams({ ...workflowParams, error: e.target.value })
                    }
                  />
                </div>
              )}

              {selectedWorkflow.name.includes('API') && (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workflow-endpoint">Endpoint</Label>
                    <Input
                      id="workflow-endpoint"
                      placeholder="https://api.example.com/v1/resource"
                      value={workflowParams.endpoint || ''}
                      onChange={(e) =>
                        setWorkflowParams({ ...workflowParams, endpoint: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workflow-method">Method</Label>
                    <Select
                      value={workflowParams.method || 'GET'}
                      onValueChange={(value) =>
                        setWorkflowParams({ ...workflowParams, method: value })
                      }
                    >
                      <SelectTrigger id="workflow-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {selectedWorkflow.name.includes('Daily') && (
                <div className="space-y-2">
                  <Label htmlFor="workflow-notes">Daily Notes</Label>
                  <Textarea
                    id="workflow-notes"
                    placeholder="What did you work on today? Any blockers?"
                    className="min-h-[80px]"
                    value={workflowParams.notes || ''}
                    onChange={(e) =>
                      setWorkflowParams({ ...workflowParams, notes: e.target.value })
                    }
                  />
                </div>
              )}

              {/* Generic input for other workflows */}
              {!selectedWorkflow.name.includes('Code') &&
                !selectedWorkflow.name.includes('Error') &&
                !selectedWorkflow.name.includes('API') &&
                !selectedWorkflow.name.includes('Daily') &&
                !selectedWorkflow.name.includes('Research') && (
                  <div className="space-y-2">
                    <Label htmlFor="workflow-input">Input</Label>
                    <Textarea
                      id="workflow-input"
                      placeholder="Enter your input..."
                      className="min-h-[100px]"
                      value={workflowParams.input || ''}
                      onChange={(e) =>
                        setWorkflowParams({ ...workflowParams, input: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Provide the content for {selectedWorkflow.name.toLowerCase()}
                    </p>
                  </div>
                )}

              {/* Deep Research workflow specific input */}
              {selectedWorkflow.name.includes('Research') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="workflow-topic">Research Topic</Label>
                    <Textarea
                      id="workflow-topic"
                      placeholder="e.g., 'Quantum computing applications in cryptography', 'History of coffee cultivation', 'Machine learning interpretability techniques'..."
                      className="min-h-[80px]"
                      value={workflowParams.topic || ''}
                      onChange={(e) =>
                        setWorkflowParams({ ...workflowParams, topic: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="workflow-areas">Focus Areas</Label>
                      <Select
                        value={workflowParams.areas || 'overview, key concepts, applications'}
                        onValueChange={(value) =>
                          setWorkflowParams({ ...workflowParams, areas: value })
                        }
                      >
                        <SelectTrigger id="workflow-areas">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="overview, key concepts, applications">
                            Overview + Concepts
                          </SelectItem>
                          <SelectItem value="history, evolution, timeline">
                            Historical Evolution
                          </SelectItem>
                          <SelectItem value="technical, scientific, research">
                            Technical Deep Dive
                          </SelectItem>
                          <SelectItem value="business, market, industry">
                            Business & Market
                          </SelectItem>
                          <SelectItem value="practical, how-to, examples">
                            Practical Guide
                          </SelectItem>
                          <SelectItem value="comprehensive">All Areas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workflow-depth">Depth Level</Label>
                      <Select
                        value={workflowParams.depth || 'comprehensive'}
                        onValueChange={(value) =>
                          setWorkflowParams({ ...workflowParams, depth: value })
                        }
                      >
                        <SelectTrigger id="workflow-depth">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="brief">Brief Overview</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="comprehensive">Comprehensive</SelectItem>
                          <SelectItem value="academic">Academic Level</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Model selector for agent-based workflows */}
              {(selectedWorkflow.name.includes('Review') ||
                selectedWorkflow.name.includes('Explainer') ||
                selectedWorkflow.name.includes('Refactoring') ||
                selectedWorkflow.name.includes('Research')) && (
                <div className="space-y-2">
                  <Label htmlFor="workflow-model">Model (optional)</Label>
                  <Select
                    value={workflowParams.modelId || selectedModel}
                    onValueChange={(value) =>
                      setWorkflowParams({ ...workflowParams, modelId: value })
                    }
                  >
                    <SelectTrigger id="workflow-model">
                      <SelectValue placeholder="Use default model" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedModels).map(([group, groupModels]) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {(groupModels as Model[]).map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.display_name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowWorkflowDialog(false)}
              disabled={isExecutingWorkflow}
            >
              Cancel
            </Button>
            <Button onClick={handleExecuteWorkflow} disabled={isExecutingWorkflow}>
              {isExecutingWorkflow ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tool Execution Dialog */}
      <Dialog open={showToolDialog} onOpenChange={setShowToolDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run Tool: {selectedToolForDialog?.name}</DialogTitle>
            <DialogDescription>
              {selectedToolForDialog?.description || 'Execute this tool with custom parameters.'}
            </DialogDescription>
          </DialogHeader>

          {selectedToolForDialog && (
            <div className="space-y-4 py-4">
              {Object.entries(selectedToolForDialog.parameters).map(([paramName, paramInfo]) => (
                <div key={paramName} className="space-y-2">
                  <Label htmlFor={`tool-param-${paramName}`}>
                    {paramName}
                    {paramInfo.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {paramName === 'command' ? (
                    <Textarea
                      id={`tool-param-${paramName}`}
                      placeholder={paramInfo.description}
                      className="min-h-[80px] font-mono text-sm"
                      value={toolParams[paramName] || ''}
                      onChange={(e) =>
                        setToolParams({ ...toolParams, [paramName]: e.target.value })
                      }
                    />
                  ) : paramName === 'content' || paramName === 'body' ? (
                    <Textarea
                      id={`tool-param-${paramName}`}
                      placeholder={paramInfo.description}
                      className="min-h-[100px] text-sm"
                      value={toolParams[paramName] || ''}
                      onChange={(e) =>
                        setToolParams({ ...toolParams, [paramName]: e.target.value })
                      }
                    />
                  ) : (
                    <Input
                      id={`tool-param-${paramName}`}
                      type={paramInfo.type === 'number' ? 'number' : 'text'}
                      placeholder={paramInfo.description}
                      value={toolParams[paramName] || ''}
                      onChange={(e) =>
                        setToolParams({ ...toolParams, [paramName]: e.target.value })
                      }
                    />
                  )}
                  <p className="text-xs text-muted-foreground">{paramInfo.description}</p>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowToolDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExecuteTool}>
              <Wrench className="h-4 w-4 mr-2" />
              Run Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Directory Dialog */}
      <Dialog open={showWorkDirDialog} onOpenChange={setShowWorkDirDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Work Directory</DialogTitle>
            <DialogDescription>
              Choose where AI should create project files. All relative paths will be based on this
              directory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Work Directory</label>
              <div className="p-3 bg-muted rounded text-sm font-mono break-all">
                {workDirectory}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Work Directory (Absolute Path)</label>
              <Input
                placeholder="D:\MyProjects or /home/user/projects"
                value={newWorkDir}
                onChange={(e) => setNewWorkDir(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use an absolute path to your desired project directory.
                <br />
                Windows: <code>D:\Projects</code> | macOS/Linux: <code>/home/user/projects</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkDirDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetWorkDirectory} disabled={!newWorkDir}>
              Set Directory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-background border rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start px-3 py-2 h-auto text-sm"
              onClick={() => copySession(contextMenu.sessionId)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Conversation
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start px-3 py-2 h-auto text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                deleteSession(contextMenu.sessionId);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </>
      )}
    </>
  );
}
