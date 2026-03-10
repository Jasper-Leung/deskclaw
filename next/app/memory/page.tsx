'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Memory {
  id: string;
  agent_id: string;
  content: string;
  importance: number;
  created_at: number;
}

interface Agent {
  id: string;
  name: string;
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [memoriesData, agentsData] = await Promise.all([
          window.electronAPI.memory.list(),

          window.electronAPI.agents.list(),
        ]);
        setMemories(memoriesData);
        setAgents(agentsData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleAddMemory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.memory.create({
          agentId: formData.get('agentId') as string,
          content: formData.get('content') as string,
          importance: formData.get('importance')
            ? parseFloat(formData.get('importance') as string)
            : undefined,
        });
        await loadData();
        setShowAddMemory(false);
      }
    } catch (error) {
      console.error('Failed to add memory:', error);
      alert('Failed to add memory. Please try again.');
    }
  };

  const handleUpdateMemory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingMemory) return;

    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.memory.update(editingMemory.id, {
          content: formData.get('content') as string,
          importance: formData.get('importance')
            ? parseFloat(formData.get('importance') as string)
            : undefined,
        });
        await loadData();
        setEditingMemory(null);
      }
    } catch (error) {
      console.error('Failed to update memory:', error);
      alert('Failed to update memory. Please try again.');
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.memory.delete(id);
        await loadData();
      }
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || 'Unknown Agent';
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Memory Vault</h1>
          <Button onClick={() => setShowAddMemory(!showAddMemory)} disabled={agents.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            Add Memory
          </Button>
        </div>

        {showAddMemory && (
          <form onSubmit={handleAddMemory} className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="agentId">Agent</Label>
                <select
                  id="agentId"
                  name="agentId"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  required
                >
                  <option value="">Select an agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <textarea
                  id="content"
                  name="content"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Enter the memory content..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="importance">Importance (0-1)</Label>
                <Input
                  id="importance"
                  name="importance"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  placeholder="1.0"
                />
                <p className="text-xs text-muted-foreground">
                  Higher importance memories are retrieved more often. Default is 1.0
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddMemory(false)}>
                Cancel
              </Button>
              <Button type="submit">Add Memory</Button>
            </div>
          </form>
        )}

        {editingMemory && (
          <form
            onSubmit={handleUpdateMemory}
            className="space-y-4 rounded-lg border p-4 bg-muted/50"
          >
            <h3 className="font-semibold">Edit Memory</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Agent</Label>
                <p className="text-sm text-muted-foreground">
                  {getAgentName(editingMemory.agent_id)}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-content">Content</Label>
                <textarea
                  id="edit-content"
                  name="content"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  defaultValue={editingMemory.content}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-importance">Importance (0-1)</Label>
                <Input
                  id="edit-importance"
                  name="importance"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue={editingMemory.importance}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingMemory(null)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        )}

        {memories.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            {agents.length === 0
              ? 'Create an agent first to add memories.'
              : 'No memories stored yet. Add memories to help agents remember important information.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {memories.map((memory) => (
              <div key={memory.id} className="flex flex-col rounded-lg border p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    {getAgentName(memory.agent_id)}
                  </span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    Importance: {memory.importance.toFixed(1)}
                  </span>
                </div>
                <p className="text-sm flex-1">{memory.content}</p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setEditingMemory(memory)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteMemory(memory.id)}>
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
