'use client';

import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';

interface NodeConfigPanelProps {
  node: Node;
  models: any[];
  onSave: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export function NodeConfigPanel({ node, models, onSave, onClose }: NodeConfigPanelProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(node.data);

  useEffect(() => {
    setFormData(node.data);
  }, [node]);

  const handleSave = () => {
    onSave(node.id, formData);
    onClose();
  };

  const groupedModels = models.reduce((acc: Record<string, any[]>, model: any) => {
    const key = model.isCustom ? 'Custom Models' : 'Built-in Models';
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});

  return (
    <div className="w-80 border-l bg-card p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Configure Node</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Common: Label */}
        <div className="space-y-2">
          <Label htmlFor="node-label">Label</Label>
          <Input
            id="node-label"
            value={(formData.label as string) || ''}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
          />
        </div>

        {/* Agent Node Configuration */}
        {node.type === 'agent' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="agent-model">Model</Label>
              <Select
                value={(formData.modelId as string) || ''}
                onValueChange={(value) => setFormData({ ...formData, modelId: value })}
              >
                <SelectTrigger id="agent-model">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedModels).map(([group, groupModels]) => (
                    <div key={group}>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                        {group}
                      </div>
                      {groupModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-prompt">System Prompt</Label>
              <Textarea
                id="agent-prompt"
                value={(formData.systemPrompt as string) || ''}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                placeholder="You are a helpful assistant..."
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-temp">
                Temperature: {((formData.temperature as number) || 0.7).toFixed(2)}
              </Label>
              <Slider
                id="agent-temp"
                min={0}
                max={2}
                step={0.1}
                value={[(formData.temperature as number) || 0.7]}
                onValueChange={([value]) => setFormData({ ...formData, temperature: value })}
              />
            </div>
          </>
        )}

        {/* Prompt Node Configuration */}
        {node.type === 'prompt' && (
          <div className="space-y-2">
            <Label htmlFor="prompt-content">Prompt Content</Label>
            <Textarea
              id="prompt-content"
              value={(formData.prompt as string) || ''}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              placeholder="Enter your prompt template..."
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{variable}'} syntax for dynamic values
            </p>
          </div>
        )}

        {/* Shell Node Configuration */}
        {node.type === 'shell' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="shell-command">Command</Label>
              <Textarea
                id="shell-command"
                value={(formData.command as string) || ''}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                placeholder="echo 'Hello World'"
                className="min-h-[80px] font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shell-approval"
                checked={(formData.requireApproval as boolean) || false}
                onChange={(e) => setFormData({ ...formData, requireApproval: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="shell-approval" className="text-sm">
                Require approval before execution
              </Label>
            </div>
          </>
        )}

        {/* Tool Node Configuration */}
        {node.type === 'tool' && (
          <div className="space-y-2">
            <Label htmlFor="tool-name">Tool Name</Label>
            <select
              id="tool-name"
              value={(formData.toolName as string) || ''}
              onChange={(e) => setFormData({ ...formData, toolName: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Select a tool</option>
              <option value="web_search">Web Search</option>
              <option value="file_read">File Read</option>
              <option value="file_write">File Write</option>
              <option value="http_request">HTTP Request</option>
            </select>
          </div>
        )}

        {/* Trigger Node Configuration */}
        {node.type === 'trigger' && (
          <div className="space-y-2">
            <Label htmlFor="trigger-type">Trigger Type</Label>
            <select
              id="trigger-type"
              value={(formData.triggerType as string) || 'manual'}
              onChange={(e) => setFormData({ ...formData, triggerType: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="manual">Manual Trigger</option>
              <option value="cron">Cron Schedule</option>
            </select>

            {formData.triggerType === 'cron' && (
              <div className="space-y-2 mt-2">
                <Label htmlFor="cron-expression">Cron Expression</Label>
                <Input
                  id="cron-expression"
                  value={(formData.cronExpression as string) || ''}
                  onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                  placeholder="0 * * * *"
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day month weekday
                </p>
              </div>
            )}
          </div>
        )}

        {/* Conditional Node Configuration */}
        {node.type === 'conditional' && (
          <div className="space-y-2">
            <Label htmlFor="condition-expression">Condition</Label>
            <Textarea
              id="condition-expression"
              value={(formData.condition as string) || ''}
              onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
              placeholder="Enter condition expression..."
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Output will go to &quot;true&quot; or &quot;false&quot; output handle
            </p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
