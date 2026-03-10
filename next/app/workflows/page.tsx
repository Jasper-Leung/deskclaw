'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Play, Edit, Save, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { WorkflowCanvas } from '@/components/workflow/workflow-canvas';
import { NodeConfigPanel } from '@/components/workflow/node-config-panel';
import type { Node, Edge } from '@xyflow/react';

interface Workflow {
  id: string;
  name: string;
  definition_json?: { nodes: Node[]; edges: Edge[] };
  created_at: number;
  updated_at: number;
  description?: string;
  is_preset?: number;
}

const nodeTemplates = [
  { type: 'trigger', label: 'Trigger', icon: '▶' },
  { type: 'agent', label: 'Agent', icon: '🤖' },
  { type: 'tool', label: 'Tool', icon: '🔧' },
  { type: 'prompt', label: 'Prompt', icon: '📝' },
  { type: 'shell', label: 'Shell', icon: '💻' },
  { type: 'conditional', label: 'Conditional', icon: '🔀' },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showAddWorkflow, setShowAddWorkflow] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [models, setModels] = useState<any[]>([]);

  useEffect(() => {
    loadWorkflows();
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      if (window.electronAPI) {
        const modelsData = await window.electronAPI.models.list();
        setModels(modelsData);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadWorkflows = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.workflows.list();
        setWorkflows(data);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };

  const handleAddWorkflow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.workflows.create({
          name: formData.get('name') as string,
        });
        await loadWorkflows();
        setShowAddWorkflow(false);
      }
    } catch (error) {
      console.error('Failed to add workflow:', error);
      alert('Failed to add workflow. Please try again.');
    }
  };

  const handleUpdateWorkflow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingWorkflow) return;

    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.workflows.update(editingWorkflow.id, {
          name: formData.get('name') as string,
        });
        await loadWorkflows();
        setEditingWorkflow(null);
      }
    } catch (error) {
      console.error('Failed to update workflow:', error);
      alert('Failed to update workflow. Please try again.');
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.workflows.delete(id);
        if (selectedWorkflow?.id === id) {
          setSelectedWorkflow(null);
        }
        await loadWorkflows();
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
  };

  const handleExecuteWorkflow = async (id: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.workflows.execute(id);
        alert(`Workflow started! Execution ID: ${result.executionId}`);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      alert('Failed to execute workflow. Please try again.');
    }
  };

  const handleSelectWorkflow = async (workflow: Workflow) => {
    try {
      if (window.electronAPI) {
        const fullWorkflow = await window.electronAPI.workflows.get(workflow.id);
        setSelectedWorkflow(fullWorkflow);
        setNodes(fullWorkflow.definitionJson?.nodes || []);
        setEdges(fullWorkflow.definitionJson?.edges || []);
      }
    } catch (error) {
      console.error('Failed to load workflow:', error);
    }
  };

  const handleCanvasChange = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);

  const handleNodeConfigSave = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => (node.id === nodeId ? { ...node, data } : node))
    );
  }, []);

  const handleSaveWorkflow = async () => {
    if (!selectedWorkflow) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.workflows.update(selectedWorkflow.id, {
          nodes: nodes,
          edges: edges,
        });
        alert('Workflow saved!');
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      alert('Failed to save workflow. Please try again.');
    }
  };

  const handleAddNode = (type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: { x: 250, y: 100 + nodes.length * 100 },
      data: {
        label: nodeTemplates.find((t) => t.type === type)?.label || type,
      },
    };
    setNodes([...nodes, newNode]);
  };

  if (selectedWorkflow) {
    return (
      <AppShell>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedWorkflow(null)}>
                <X className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-semibold">{selectedWorkflow.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExecuteWorkflow(selectedWorkflow.id)}
              >
                <Play className="h-4 w-4 mr-2" />
                Run
              </Button>
              <Button size="sm" onClick={handleSaveWorkflow}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar - Node Palette */}
            <div className={`border-r p-4 overflow-y-auto ${selectedNode ? 'w-48' : 'w-48'}`}>
              <h3 className="font-semibold mb-3 text-sm">Add Nodes</h3>
              <div className="space-y-2">
                {nodeTemplates.map((template) => (
                  <Button
                    key={template.type}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleAddNode(template.type)}
                  >
                    <span className="mr-2">{template.icon}</span>
                    {template.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 relative">
              <WorkflowCanvas
                initialNodes={nodes}
                initialEdges={edges}
                onChange={handleCanvasChange}
                onNodeSelect={handleNodeSelect}
              />
            </div>

            {/* Node Config Panel */}
            {selectedNode && (
              <NodeConfigPanel
                node={selectedNode}
                models={models}
                onSave={handleNodeConfigSave}
                onClose={() => setSelectedNode(null)}
              />
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <Button onClick={() => setShowAddWorkflow(!showAddWorkflow)}>
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>

        {showAddWorkflow && (
          <form onSubmit={handleAddWorkflow} className="space-y-4 rounded-lg border p-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workflow Name</Label>
              <Input id="name" name="name" placeholder="My Workflow" required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddWorkflow(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Workflow</Button>
            </div>
          </form>
        )}

        {editingWorkflow && (
          <form
            onSubmit={handleUpdateWorkflow}
            className="space-y-4 rounded-lg border p-4 bg-muted/50"
          >
            <h3 className="font-semibold">Edit Workflow</h3>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Workflow Name</Label>
              <Input id="edit-name" name="name" defaultValue={editingWorkflow.name} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingWorkflow(null)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        )}

        {workflows.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            No workflows yet. Create your first workflow to automate tasks.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className={`flex flex-col rounded-lg border p-4 cursor-pointer hover:border-primary transition-colors ${
                  workflow.is_preset ? 'border-primary/30 bg-primary/5' : ''
                }`}
                onClick={() => handleSelectWorkflow(workflow)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{workflow.name}</h3>
                      {workflow.is_preset && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                          Preset
                        </span>
                      )}
                    </div>
                    {workflow.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {workflow.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Created: {new Date(workflow.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleExecuteWorkflow(workflow.id)}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Run
                  </Button>
                  {!workflow.is_preset && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingWorkflow(workflow)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
