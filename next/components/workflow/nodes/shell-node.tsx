'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Terminal } from 'lucide-react';

interface ShellNodeData extends Record<string, unknown> {
  label: string;
  command?: string;
  requireApproval?: boolean;
}

export const ShellNode = memo(({ data }: NodeProps) => {
  const nodeData = data as ShellNodeData;

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-gray-50 dark:bg-gray-900/30 border-2 border-gray-500 min-w-[150px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-500" />
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-medium">{nodeData.label}</span>
        {nodeData.requireApproval && (
          <span className="text-xs bg-red-100 text-red-800 px-1 rounded">!</span>
        )}
      </div>
      {nodeData.command && (
        <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[130px]">
          {nodeData.command}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-gray-500" />
    </div>
  );
});

ShellNode.displayName = 'ShellNode';
