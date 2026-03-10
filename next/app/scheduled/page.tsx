'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Trash2,
  Play,
  Pause,
  Terminal,
  Wrench,
  Bot,
  Bell,
  Workflow,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { useState, useEffect } from 'react';

type TaskType = 'workflow' | 'tool' | 'command' | 'prompt' | 'reminder' | 'skill';

interface ScheduledTask {
  id: string;
  name: string;
  taskType: TaskType;
  cronExpression: string;
  taskConfig: Record<string, unknown>;
  enabled: boolean;
  lastRun: number | null;
  lastResult: string | null;
  sessionId?: string;
}

interface Workflow {
  id: string;
  name: string;
}

const TASK_TYPE_INFO: Record<TaskType, { label: string; icon: React.ReactNode; color: string }> = {
  workflow: { label: 'Workflow', icon: <Workflow className="h-4 w-4" />, color: 'text-blue-500' },
  tool: { label: 'Tool', icon: <Wrench className="h-4 w-4" />, color: 'text-green-500' },
  command: { label: 'Command', icon: <Terminal className="h-4 w-4" />, color: 'text-orange-500' },
  prompt: { label: 'AI Prompt', icon: <Bot className="h-4 w-4" />, color: 'text-purple-500' },
  reminder: { label: 'Reminder', icon: <Bell className="h-4 w-4" />, color: 'text-yellow-500' },
  skill: { label: 'Skill', icon: <Zap className="h-4 w-4" />, color: 'text-cyan-500' },
};

const AVAILABLE_TOOLS = [
  'file_read',
  'file_write',
  'file_list',
  'web_search',
  'http_request',
  'get_time',
  'execute_command',
];

export default function ScheduledPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>('reminder');
  const [selectedTool, setSelectedTool] = useState('web_search');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [tasksData, workflowsData] = await Promise.all([
          window.electronAPI.scheduled.list(),

          window.electronAPI.workflows.list(),
        ]);
        setTasks(tasksData);
        setWorkflows(workflowsData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        const name = formData.get('name') as string;
        const cronExpression = formData.get('cronExpression') as string;

        const taskConfig: Record<string, unknown> = {};

        switch (taskType) {
          case 'workflow':
            taskConfig.workflowId = formData.get('workflowId');
            break;
          case 'tool': {
            taskConfig.toolName = formData.get('toolName');
            const toolParams = formData.get('toolParams') as string;
            if (toolParams) {
              try {
                taskConfig.toolParams = JSON.parse(toolParams);
              } catch {
                alert('Invalid JSON for tool parameters');
                return;
              }
            }
            break;
          }
          case 'command':
            taskConfig.command = formData.get('command');
            break;
          case 'prompt':
            taskConfig.prompt = formData.get('prompt');
            break;
          case 'skill':
            taskConfig.message = formData.get('message');
            taskConfig.skillId = formData.get('skillId') || undefined;
            taskConfig.skillAutoMatch = !formData.get('skillId');
            break;
        }

        // Get the schedule type
        const scheduleType = (formData.get('scheduleType') as string) || 'recurring';

        await window.electronAPI.scheduled.create({
          name,
          taskType,
          cronExpression,
          taskConfig,
          enabled: scheduleType === 'recurring',
          oneTime: scheduleType === 'one-time',
        });

        await loadData();
        setShowAddTask(false);
      }
    } catch (error) {
      console.error('Failed to add scheduled task:', error);
      alert('Failed to add scheduled task. Please try again.');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled task?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.scheduled.delete(id);
        await loadData();
      }
    } catch (error) {
      console.error('Failed to delete scheduled task:', error);
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.scheduled.toggle(id);
        await loadData();
      }
    } catch (error) {
      console.error('Failed to toggle scheduled task:', error);
    }
  };

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const renderTaskConfigForm = () => {
    switch (taskType) {
      case 'workflow':
        return (
          <div className="space-y-2">
            <Label htmlFor="workflowId">Workflow</Label>
            <select
              id="workflowId"
              name="workflowId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              required
            >
              <option value="">Select a workflow</option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </div>
        );
      case 'tool':
        return (
          <div className="space-y-2">
            <Label htmlFor="toolName">Tool</Label>
            <select
              id="toolName"
              name="toolName"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
              required
            >
              {AVAILABLE_TOOLS.map((tool) => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </select>
            <Label htmlFor="toolParams">Parameters (JSON, optional)</Label>
            <Input id="toolParams" name="toolParams" placeholder='{"query": "weather today"}' />
          </div>
        );
      case 'command':
        return (
          <div className="space-y-2">
            <Label htmlFor="command">Shell Command</Label>
            <Input id="command" name="command" placeholder="npm run build" required />
          </div>
        );
      case 'prompt':
        return (
          <div className="space-y-2">
            <Label htmlFor="prompt">AI Prompt</Label>
            <textarea
              id="prompt"
              name="prompt"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              placeholder="Summarize today's tech news..."
              required
            />
          </div>
        );
      case 'reminder':
        return (
          <div className="space-y-2">
            <Label htmlFor="message">Reminder Message</Label>
            <Input id="message" name="message" placeholder="Time for a break!" required />
          </div>
        );
      case 'skill':
        return (
          <div className="space-y-2">
            <Label htmlFor="skillId">Skill</Label>
            <select
              id="skillId"
              name="skillId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Select a skill...</option>
              <option value="">Auto-match from prompt</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Select a specific skill or let the system auto-match based on your prompt
            </p>
          </div>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Scheduled Tasks</h1>
          <Button onClick={() => setShowAddTask(!showAddTask)}>
            <Plus className="mr-2 h-4 w-4" />
            Schedule Task
          </Button>
        </div>

        {showAddTask && (
          <form onSubmit={handleAddTask} className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Task Name</Label>
                <Input id="name" name="name" placeholder="Daily Report" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taskType">Task Type</Label>
                <select
                  id="taskType"
                  name="taskType"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                >
                  {Object.entries(TASK_TYPE_INFO).map(([type, info]) => (
                    <option key={type} value={type}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {renderTaskConfigForm()}
              <div className="space-y-2">
                <Label htmlFor="cronExpression">Cron Expression</Label>
                <Input id="cronExpression" name="cronExpression" placeholder="0 9 * * *" required />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day month weekday. Examples: "0 9 * * *" (daily 9am), "*/20 *
                  * * *" (every 20 sec)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Task Schedule Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scheduleType"
                    value="recurring"
                    defaultChecked
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Recurring (runs on schedule)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="scheduleType" value="one-time" className="h-4 w-4" />
                  <span className="text-sm">One-time (runs once immediately)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddTask(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Task</Button>
            </div>
          </form>
        )}

        {tasks.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            No scheduled tasks. Create one to automate your workflows.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => {
              const typeInfo = TASK_TYPE_INFO[task.taskType];
              return (
                <div key={task.id} className="flex flex-col rounded-lg border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={typeInfo.color}>{typeInfo.icon}</span>
                      <h3 className="font-semibold">{task.name}</h3>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        task.enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {task.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="text-sm space-y-1 mb-4">
                    <p className="text-muted-foreground">
                      <span className="font-medium">Type:</span> {typeInfo.label}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Cron:</span> {task.cronExpression}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">Last run:</span> {formatTimestamp(task.lastRun)}
                    </p>
                    {task.lastResult && (
                      <p className="text-muted-foreground text-xs truncate" title={task.lastResult}>
                        <span className="font-medium">Result:</span>{' '}
                        {task.lastResult.substring(0, 50)}...
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 mt-auto">
                    {task.taskType === 'prompt' && task.sessionId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Store the session ID to navigate to chat page
                          sessionStorage.setItem('scheduledSessionId', task.sessionId || '');
                          // Navigate to chat page
                          window.location.href = '/chat';
                        }}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        查看对话
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleToggleTask(task.id)}>
                      {task.enabled ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Enable
                        </>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteTask(task.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
