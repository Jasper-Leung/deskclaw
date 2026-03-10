'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

interface ConditionalNodeData extends Record<string, unknown> {
  label: string;
  condition?: string;
}

export const ConditionalNode = memo(({ data }: NodeProps) => {
  const nodeData = data as ConditionalNodeData;

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-500 min-w-[150px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-orange-500" />
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-orange-600" />
        <span className="text-sm font-medium">{nodeData.label}</span>
      </div>
      {nodeData.condition && (
        <p className="text-xs text-muted-foreground mt-1 truncate max-w-[130px]">
          {nodeData.condition}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="w-3 h-3 bg-green-500 left-1/3"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="w-3 h-3 bg-red-500 left-2/3"
      />
    </div>
  );
});

ConditionalNode.displayName = 'ConditionalNode';
