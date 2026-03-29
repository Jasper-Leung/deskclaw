'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Agent {
  id: string;
  name: string;
  description?: string;
  model_id?: string;
  system_prompt?: string;
  temperature?: number;
  created_at: number;
  updated_at: number;
}

interface Model {
  id: string;
  modelId: string;
  displayName: string;
  providerName: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [agentsData, modelsData] = await Promise.all([
          window.electronAPI.agents.list(),

          window.electronAPI.models.list(),
        ]);
        setAgents(agentsData);
        setModels(modelsData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleAddAgent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.agents.create({
          name: formData.get('name'),
          description: formData.get('description') || undefined,
          modelId: formData.get('modelId') || undefined,
          systemPrompt: formData.get('systemPrompt') || undefined,
          temperature: formData.get('temperature')
            ? parseFloat(formData.get('temperature') as string)
            : undefined,
        });
        await loadData();
        setShowAddAgent(false);
      }
    } catch (error) {
      console.error('Failed to add agent:', error);
      alert('Failed to add agent. Please try again.');
    }
  };

  const handleUpdateAgent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingAgent) return;

    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.agents.update(editingAgent.id, {
          name: formData.get('name') || undefined,
          description: formData.get('description') || undefined,
          modelId: formData.get('modelId') || undefined,
          systemPrompt: formData.get('systemPrompt') || undefined,
          temperature: formData.get('temperature')
            ? parseFloat(formData.get('temperature') as string)
            : undefined,
        });
        await loadData();
        setEditingAgent(null);
      }
    } catch (error) {
      console.error('Failed to update agent:', error);
      alert('Failed to update agent. Please try again.');
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.agents.delete(id);
        await loadData();
      }
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My Agents</h1>
          <Button onClick={() => setShowAddAgent(!showAddAgent)}>
            <Plus className="mr-2 h-4 w-4" />
            New Agent
          </Button>
        </div>

        {showAddAgent && (
          <form onSubmit={handleAddAgent} className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="My Assistant" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelId">Model</Label>
                <select
                  id="modelId"
                  name="modelId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Select a model</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName} ({model.providerName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="A helpful AI assistant..."
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <textarea
                  id="systemPrompt"
                  name="systemPrompt"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="You are a helpful assistant..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  name="temperature"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  placeholder="0.7"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddAgent(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Agent</Button>
            </div>
          </form>
        )}

        {editingAgent && (
          <form
            onSubmit={handleUpdateAgent}
            className="space-y-4 rounded-lg border p-4 bg-muted/50"
          >
            <h3 className="font-semibold">Edit Agent: {editingAgent.name}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" name="name" defaultValue={editingAgent.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-modelId">Model</Label>
                <select
                  id="edit-modelId"
                  name="modelId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  defaultValue={editingAgent.model_id || ''}
                >
                  <option value="">Select a model</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName} ({model.providerName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  name="description"
                  defaultValue={editingAgent.description || ''}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-systemPrompt">System Prompt</Label>
                <textarea
                  id="edit-systemPrompt"
                  name="systemPrompt"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  defaultValue={editingAgent.system_prompt || ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-temperature">Temperature</Label>
                <Input
                  id="edit-temperature"
                  name="temperature"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  defaultValue={editingAgent.temperature ?? 0.7}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingAgent(null)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        )}

        {agents.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            No agents yet. Create your first agent to get started.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex flex-col rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold">{agent.name}</h3>
                    {agent.description && (
                      <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
                    )}
                    {agent.model_id && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Model:{' '}
                        {models.find((m) => m.id === agent.model_id)?.displayName || 'Unknown'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setEditingAgent(agent)}>
                    <Settings className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteAgent(agent.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
