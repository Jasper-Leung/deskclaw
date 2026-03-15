/**
 * New Workflow Node Types Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import Database from 'better-sqlite3';

// Mock the database module
const mockDb = {
  prepare: vi.fn((query: string) => {
    if (query.includes('workflows WHERE name = ?')) {
      return {
        get: vi.fn(() => ({ id: 'test-sub-workflow' })),
      };
    }
    if (query.includes('workflows WHERE id = ?')) {
      return {
        get: vi.fn(() => ({
          definition_json: JSON.stringify({
            nodes: [
              { id: 'sub-node-1', type: 'trigger', position: { x: 100, y: 50 }, data: {} },
            ],
            edges: [],
          }),
        })),
      };
    }
    return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) };
  }),
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
}));

// Mock token counter
vi.mock('../lib/token-counter.js', () => ({
  countMessageTokens: vi.fn(() => 10),
  countMessagesTokens: vi.fn(() => 100),
}));

describe('New Workflow Node Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loop node', () => {
    it('should execute fixed count loop', async () => {
      const { executeWorkflow } = await import('./index.js');
      const loopNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'loop-1',
          type: 'loop',
          position: { x: 100, y: 150 },
          data: {
            label: 'Count Loop',
            loopType: 'count',
            maxIterations: 3,
          },
        },
      ];

      const loopEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'loop-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        loopNodes,
        loopEdges
      );

      expect(result.status).toBe('completed');
      expect(result.results['loop-1']).toBeDefined();
    });

    it('should handle conditional loop', async () => {
      const { executeWorkflow } = await import('./index.js');
      const loopNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'loop-1',
          type: 'loop',
          position: { x: 100, y: 150 },
          data: {
            label: 'Conditional Loop',
            loopType: 'conditional',
            maxIterations: 5,
            loopCondition: 'true',
          },
        },
      ];

      const loopEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'loop-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        loopNodes,
        loopEdges
      );

      expect(result.status).toBe('completed');
    });
  });

  describe('delay node', () => {
    it('should wait for specified duration', async () => {
      const { executeWorkflow } = await import('./index.js');
      const startTime = Date.now();

      const delayNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'delay-1',
          type: 'delay',
          position: { x: 100, y: 150 },
          data: {
            label: 'Wait 500ms',
            delayMs: 500,
          },
        },
      ];

      const delayEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'delay-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        delayNodes,
        delayEdges
      );

      const elapsed = Date.now() - startTime;
      expect(result.status).toBe('completed');
      expect(elapsed).toBeGreaterThanOrEqual(450); // Allow some margin
    }, 10000);
  });

  describe('variable node', () => {
    it('should set variable value', async () => {
      const { executeWorkflow } = await import('./index.js');
      const varNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'var-1',
          type: 'variable',
          position: { x: 100, y: 150 },
          data: {
            label: 'Set Variable',
            variableName: 'testVar',
            value: 'test value',
          },
        },
      ];

      const varEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'var-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        varNodes,
        varEdges
      );

      expect(result.status).toBe('completed');
      expect(result.results['var-1']).toBeDefined();
      expect((result.results['var-1'] as any).result.value).toBe('test value');
    });

    it('should apply uppercase transformation', async () => {
      const { executeWorkflow } = await import('./index.js');
      const varNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'var-1',
          type: 'variable',
          position: { x: 100, y: 150 },
          data: {
            label: 'Uppercase Variable',
            variableName: 'upperVar',
            value: 'hello world',
            transformType: 'uppercase',
          },
        },
      ];

      const varEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'var-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        varNodes,
        varEdges
      );

      expect(result.status).toBe('completed');
      expect((result.results['var-1'] as any).result.value).toBe('HELLO WORLD');
    });

    it('should apply json_stringify transformation', async () => {
      const { executeWorkflow } = await import('./index.js');
      const varNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'var-1',
          type: 'variable',
          position: { x: 100, y: 150 },
          data: {
            label: 'Stringify Object',
            variableName: 'jsonVar',
            value: { key: 'value', number: 42 },
            transformType: 'json_stringify',
          },
        },
      ];

      const varEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'var-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        varNodes,
        varEdges
      );

      expect(result.status).toBe('completed');
      const jsonValue = (result.results['var-1'] as any).result.value;
      expect(jsonValue).toBe('{"key":"value","number":42}');
    });
  });

  describe('merge node', () => {
    it('should merge all previous results', async () => {
      const { executeWorkflow } = await import('./index.js');
      const mergeNodes: Node[] = [
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
          data: { label: 'First', prompt: 'First input' },
        },
        {
          id: 'prompt-2',
          type: 'prompt',
          position: { x: 100, y: 250 },
          data: { label: 'Second', prompt: 'Second input' },
        },
        {
          id: 'merge-1',
          type: 'merge',
          position: { x: 100, y: 350 },
          data: {
            label: 'Merge Results',
            mergeType: 'all',
          },
        },
      ];

      const mergeEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'prompt-1' },
        { id: 'e2', source: 'prompt-1', target: 'prompt-2' },
        { id: 'e3', source: 'prompt-2', target: 'merge-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        mergeNodes,
        mergeEdges
      );

      expect(result.status).toBe('completed');
      expect(result.results['merge-1']).toBeDefined();
      const mergeResult = result.results['merge-1'] as any;
      expect(mergeResult.result.count).toBeGreaterThan(0);
    });
  });

  describe('switch node', () => {
    it('should match exact case value', async () => {
      const { executeWorkflow } = await import('./index.js');
      const switchNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'switch-1',
          type: 'switch',
          position: { x: 100, y: 150 },
          data: {
            label: 'Type Switch',
            expression: 'typeA',
            cases: {
              typeA: 'path_a',
              typeB: 'path_b',
            },
            default: 'path_default',
          },
        },
      ];

      const switchEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'switch-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        switchNodes,
        switchEdges
      );

      expect(result.status).toBe('completed');
      const switchResult = result.results['switch-1'] as any;
      expect(switchResult.result.matchedValue).toBe('path_a');
    });

    it('should use default value when no match', async () => {
      const { executeWorkflow } = await import('./index.js');
      const switchNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'switch-1',
          type: 'switch',
          position: { x: 100, y: 150 },
          data: {
            label: 'Type Switch',
            expression: 'typeC',
            cases: {
              typeA: 'path_a',
              typeB: 'path_b',
            },
            default: 'path_default',
          },
        },
      ];

      const switchEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'switch-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        switchNodes,
        switchEdges
      );

      expect(result.status).toBe('completed');
      const switchResult = result.results['switch-1'] as any;
      expect(switchResult.result.matchedValue).toBe('path_default');
    });
  });

  describe('sub-workflow node', () => {
    it('should execute sub-workflow by name', async () => {
      const { executeWorkflow } = await import('./index.js');
      const subWorkflowNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'sub-1',
          type: 'sub-workflow',
          position: { x: 100, y: 150 },
          data: {
            label: 'Call Sub Workflow',
            workflowName: 'Test Sub Workflow',
            parameters: { inputParam: 'test value' },
          },
        },
      ];

      const subWorkflowEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'sub-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        subWorkflowNodes,
        subWorkflowEdges
      );

      expect(result.status).toBe('completed');
      expect(result.results['sub-1']).toBeDefined();
    });

    it('should execute sub-workflow by ID', async () => {
      const { executeWorkflow } = await import('./index.js');
      const subWorkflowNodes: Node[] = [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 100, y: 50 },
          data: {},
        },
        {
          id: 'sub-1',
          type: 'sub-workflow',
          position: { x: 100, y: 150 },
          data: {
            label: 'Call Sub Workflow by ID',
            workflowId: 'test-sub-workflow',
          },
        },
      ];

      const subWorkflowEdges: Edge[] = [
        { id: 'e1', source: 'trigger-1', target: 'sub-1' },
      ];

      const result = await executeWorkflow(
        mockDb as unknown as Database.Database,
        'test-workflow-id',
        subWorkflowNodes,
        subWorkflowEdges
      );

      expect(result.status).toBe('completed');
      expect(result.results['sub-1']).toBeDefined();
    });
  });
});
