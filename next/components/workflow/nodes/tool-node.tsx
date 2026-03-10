'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Wrench } from 'lucide-react';

interface ToolNodeData extends Record<string, unknown> {
  label: string;
  toolName?: string;
}

export const ToolNode = memo(({ data }: NodeProps) => {
  const nodeData = data as ToolNodeData;

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-purple-50 dark:bg-purple-900/30 border-2 border-purple-500 min-w-[150px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-500" />
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-medium">{nodeData.label}</span>
      </div>
      {nodeData.toolName && (
        <p className="text-xs text-muted-foreground mt-1">{nodeData.toolName}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-purple-500" />
    </div>
  );
});

ToolNode.displayName = 'ToolNode';
