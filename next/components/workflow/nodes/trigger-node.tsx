'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play, Clock } from 'lucide-react';

interface TriggerNodeData extends Record<string, unknown> {
  label: string;
  triggerType: 'manual' | 'cron';
  cronExpression?: string;
}

export const TriggerNode = memo(({ data }: NodeProps) => {
  const nodeData = data as TriggerNodeData;

  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-green-50 dark:bg-green-900/30 border-2 border-green-500 min-w-[150px]">
      <div className="flex items-center gap-2">
        {nodeData.triggerType === 'manual' ? (
          <Play className="w-4 h-4 text-green-600" />
        ) : (
          <Clock className="w-4 h-4 text-green-600" />
        )}
        <span className="text-sm font-medium">{nodeData.label}</span>
      </div>
      {nodeData.triggerType === 'cron' && nodeData.cronExpression && (
        <p className="text-xs text-muted-foreground mt-1">{nodeData.cronExpression}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-500" />
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';
