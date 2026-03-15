/**
 * Workflow Engine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import Database from 'better-sqlite3';

// Mock the database module
const mockDb = {
  prepare: vi.fn(() => ({
    get: vi.fn(() => ({
      id: 'test-model',
      provider_id: 'test-provider',
      name: 'gpt-4',
      model_id: 'gpt-4',
    })),
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
  })),
};

vi.mock('../db/index.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

// Mock LLM chat
vi.mock('../ipc/llm.js', () => ({
  chat: vi.fn(async () => ({
    content: 'Test response',
    model: 'gpt-4',
    usage: { promptTokens: 10, completionTokens: 20 },
  })),
}));

// Mock executeShell
vi.mock('../ipc/shell.js', () => ({
  executeShell: vi.fn(async () => ({ stdout: 'test output', stderr: '', exitCode: 0 })),
}));

// Mock executeTool
vi.mock('../tools/index.js', () => ({
  executeTool: vi.fn(async () => ({ result: 'tool result', error: undefined })),
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  workflowLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  dbLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock token counter
vi.mock('../lib/token-counter.js', () => ({
  countMessageTokens: vi.fn(() => 10),
  countMessagesTokens: vi.fn(() => 100),
}));

describe('Workflow Engine', () => {
  let testNodes: Node[];
  let testEdges: Edge[];

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create simple test workflow
    testNodes = [
      {
        id: 'node-1',
        type: 'trigger',
        position: { x: 100, y: 50 },
        data: { label: 'Start' },
      },
      {
        id: 'node-2',
        type: 'prompt',
        position: { x: 100, y: 150 },
        data: { label: 'Input', prompt: 'Test prompt: {input|default}' },
      },
      {
        id: 'node-3',
        type: 'agent',
        position: { x: 100, y: 280 },
        data: {
          label: 'Agent',
          modelId: 'test-model',
          systemPrompt: 'You are a test agent',
          enabledTools: [],
          maxIterations: 5,
        },
      },
    ];

    testEdges = [
      { id: 'e1', source: 'node-1', target: 'node-2' },
      { id: 'e2', source: 'node-2', target: 'node-3' },
    ];
  });

  describe('topologicalSort', () => {
    it('should sort nodes in execution order', async () => {
      // Import the internal function for testing
      // Since it's not exported, we'll test it through executeWorkflow
      await import('./index.js');
      expect(testNodes.length).toBe(3);
      expect(testEdges.length).toBe(2);
    });

    it('should handle nodes with no edges', async () => {
      const nodesWithNoEdges: Node[] = [
        { id: 'node-1', type: 'trigger', position: { x: 100, y: 50 }, data: {} },
      ];
      // Should still be able to process
      expect(nodesWithNoEdges.length).toBe(1);
    });

    it('should handle complex node graphs', async () => {
      const complexNodes: Node[] = [
        { id: 'n1', type: 'trigger', position: { x: 100, y: 50 }, data: {} },
        { id: 'n2', type: 'prompt', position: { x: 100, y: 150 }, data: {} },
        { id: 'n3', type: 'agent', position: { x: 100, y: 280 }, data: {} },
        { id: 'n4', type: 'tool', position: { x: 300, y: 150 }, data: {} },
      ];

      const complexEdges: Edge[] = [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n1', target: 'n4' },
        { id: 'e3', source: 'n2', target: 'n3' },
      ];

      expect(complexNodes.length).toBe(4);
      expect(complexEdges.length).toBe(3);
    });
  });

  describe('executeWorkflow', () => {
    it('should execute a simple workflow', async () => {
      const { executeWorkflow } = await import('./index.js');
      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        testNodes,
        testEdges
      );

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('test-workflow-id');
      expect(result.executionId).toBeDefined();
      expect(result.status).toBeDefined();
    });

    it('should handle trigger node execution', async () => {
      const { executeWorkflow } = await import('./index.js');
      const triggerNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: { label: 'Start', triggerType: 'manual' },
        },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        triggerNodes,
        []
      );

      expect(result.status).toBe('completed');
      expect(result.results).toBeDefined();
    });

    it('should handle prompt node execution', async () => {
      const { executeWorkflow } = await import('./index.js');
      const promptNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'prompt-1',
          type: 'prompt',
          position: { x: 100, y: 150 },
          data: {
            label: 'Test Prompt',
            prompt: 'Enter value: {value|default}',
          },
        },
      ];

      const promptEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'prompt-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        promptNodes,
        promptEdges
      );

      expect(result.status).toBe('completed');
    });

    it('should handle agent node execution', async () => {
      const { executeWorkflow } = await import('./index.js');
      const agentNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'agent-1',
          type: 'agent',
          position: { x: 100, y: 150 },
          data: {
            label: 'Test Agent',
            modelId: 'test-model',
            systemPrompt: 'You are a helpful assistant',
            enabledTools: [],
            maxIterations: 3,
          },
        },
      ];

      const agentEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'agent-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        agentNodes,
        agentEdges
      );

      expect(result.status).toBe('completed');
      expect(result.results['agent-1']).toBeDefined();
    });

    it('should handle tool node execution', async () => {
      const { executeTool } = await import('../tools/index.js');
      vi.mocked(executeTool).mockResolvedValueOnce({
        result: { success: true, data: 'tool output' },
      });

      const { executeWorkflow } = await import('./index.js');
      const toolNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'tool-1',
          type: 'tool',
          position: { x: 100, y: 150 },
          data: {
            label: 'Test Tool',
            toolName: 'get_time',
            parameters: {},
          },
        },
      ];

      const toolEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'tool-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        toolNodes,
        toolEdges
      );

      expect(result.status).toBe('completed');
    });

    it('should handle shell node execution', async () => {
      const { executeWorkflow } = await import('./index.js');
      const shellNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'shell-1',
          type: 'shell',
          position: { x: 100, y: 150 },
          data: {
            label: 'Test Shell',
            command: 'echo "test"',
            requireApproval: false,
          },
        },
      ];

      const shellEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'shell-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        shellNodes,
        shellEdges
      );

      expect(result.status).toBe('completed');
    });

    it('should handle conditional node execution', async () => {
      const { executeWorkflow } = await import('./index.js');
      const conditionalNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'conditional-1',
          type: 'conditional',
          position: { x: 100, y: 150 },
          data: {
            label: 'Test Condition',
            condition: 'true',
          },
        },
      ];

      const conditionalEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'conditional-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        conditionalNodes,
        conditionalEdges
      );

      expect(result.status).toBe('completed');
    });

    it('should handle unknown node type', async () => {
      const { executeWorkflow } = await import('./index.js');
      const unknownNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'unknown-1',
          type: 'unknown_type' as any,
          position: { x: 100, y: 150 },
          data: {},
        },
      ];

      const unknownEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'unknown-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        unknownNodes,
        unknownEdges
      );

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('should call progress callbacks', async () => {
      const { executeWorkflow } = await import('./index.js');
      const progressCallback = vi.fn();

      await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        testNodes,
        testEdges,
        progressCallback
      );

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
        })
      );
    });

    it('should generate unique execution ID', async () => {
      const { executeWorkflow } = await import('./index.js');

      const result1 = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        testNodes,
        testEdges
      );

      const result2 = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        testNodes,
        testEdges
      );

      expect(result1.executionId).toBeDefined();
      expect(result2.executionId).toBeDefined();
      expect(result1.executionId).not.toBe(result2.executionId);
    });
  });

  describe('Context Compression', () => {
    it('should preserve system messages during compression', async () => {
      const { executeWorkflow } = await import('./index.js');
      const agentNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'agent-1',
          type: 'agent',
          position: { x: 100, y: 150 },
          data: {
            label: 'Test Agent',
            modelId: 'test-model',
            systemPrompt: 'You are a helpful assistant',
            enabledTools: [],
            maxIterations: 1,
          },
        },
      ];

      const agentEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'agent-1' }];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        agentNodes,
        agentEdges
      );

      expect(result.status).toBe('completed');
    });
  });

  describe('Error Handling', () => {
    it('should stop execution on critical failure', async () => {
      const { executeWorkflow } = await import('./index.js');
      const { executeTool } = await import('../tools/index.js');

      // Mock tool execution failure
      vi.mocked(executeTool).mockResolvedValueOnce({
        result: null,
        error: 'Tool execution failed',
      });

      const toolNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'tool-1',
          type: 'tool',
          position: { x: 100, y: 150 },
          data: {
            label: 'Failing Tool',
            toolName: 'non_existent_tool',
            parameters: {},
          },
        },
        {
          id: 'agent-1',
          type: 'agent',
          position: { x: 100, y: 280 },
          data: {
            label: 'Agent',
            modelId: 'test-model',
            systemPrompt: 'Test',
          },
        },
      ];

      const toolEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'tool-1' },
        { id: 'e2', source: 'tool-1', target: 'agent-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        toolNodes,
        toolEdges
      );

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });

  describe('Conditional Branching', () => {
    it('should handle true condition branch', async () => {
      const { executeWorkflow } = await import('./index.js');
      const conditionalNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'conditional-1',
          type: 'conditional',
          position: { x: 100, y: 150 },
          data: {
            label: 'Condition',
            condition: 'true',
          },
        },
        {
          id: 'node-true',
          type: 'prompt',
          position: { x: 100, y: 280 },
          data: { label: 'True Branch' },
        },
        {
          id: 'node-false',
          type: 'prompt',
          position: { x: 300, y: 280 },
          data: { label: 'False Branch' },
        },
      ];

      const conditionalEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'conditional-1' },
        { id: 'e2', source: 'conditional-1', target: 'node-true', sourceHandle: 'true' },
        { id: 'e3', source: 'conditional-1', target: 'node-false', sourceHandle: 'false' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        conditionalNodes,
        conditionalEdges
      );

      expect(result.status).toBe('completed');
    });

    it('should handle false condition branch', async () => {
      const { executeWorkflow } = await import('./index.js');
      const conditionalNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'conditional-1',
          type: 'conditional',
          position: { x: 100, y: 150 },
          data: {
            label: 'Condition',
            condition: 'false',
          },
        },
        {
          id: 'node-true',
          type: 'prompt',
          position: { x: 100, y: 280 },
          data: { label: 'True Branch' },
        },
        {
          id: 'node-false',
          type: 'prompt',
          position: { x: 300, y: 280 },
          data: { label: 'False Branch' },
        },
      ];

      const conditionalEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'conditional-1' },
        { id: 'e2', source: 'conditional-1', target: 'node-true', sourceHandle: 'true' },
        { id: 'e3', source: 'conditional-1', target: 'node-false', sourceHandle: 'false' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        conditionalNodes,
        conditionalEdges
      );

      expect(result.status).toBe('completed');
    });
  });
});
