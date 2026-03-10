'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Bot } from 'lucide-react';

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  modelId?: string;
  systemPrompt?: string;
}

export const AgentNode = memo(({ data }: NodeProps) => {
  const nodeData = data as AgentNodeData;

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500 min-w-[150px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-500" />
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium">{nodeData.label}</span>
      </div>
      {nodeData.modelId && (
        <p className="text-xs text-muted-foreground mt-1">Model: {nodeData.modelId}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-500" />
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
