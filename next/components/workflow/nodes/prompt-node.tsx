'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';

interface PromptNodeData extends Record<string, unknown> {
  label: string;
  prompt?: string;
}

export const PromptNode = memo(({ data }: NodeProps) => {
  const nodeData = data as PromptNodeData;

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-yellow-50 dark:bg-yellow-900/30 border-2 border-yellow-500 min-w-[150px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-yellow-500" />
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-yellow-600" />
        <span className="text-sm font-medium">{nodeData.label}</span>
      </div>
      {nodeData.prompt && (
        <p className="text-xs text-muted-foreground mt-1 truncate max-w-[130px]">
          {nodeData.prompt}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-yellow-500" />
    </div>
  );
});

PromptNode.displayName = 'PromptNode';
