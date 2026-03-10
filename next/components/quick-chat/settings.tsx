/**
 * Quick Chat Settings Component
 * Configure Quick Chat Agent, memory, and other settings
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Settings,
  Bot,
  Brain,
  Save,
  RotateCcw,
  Info,
  ChevronRight,
  Sparkles,
  Plus,
  Trash2,
  Edit,
  Wrench,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

interface Agent {
  id: string;
  name: string;
  description: string | null;
  memoryCount: number;
}

interface QuickChatSettingsData {
  agentId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  temperature: number;
  memoryEnabled: boolean;
  memoryMaxCount: number;
  memoryMinImportance: number;
  autoCreateMemories: boolean;
  selectedTools?: string[];
}

interface QuickChatSettingsProps {
  trigger?: React.ReactNode;
  onSettingsChange?: () => void;
}

export function QuickChatSettings({ trigger, onSettingsChange }: QuickChatSettingsProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [currentConfig, setCurrentConfig] = useState<{
    agentInfo: any;
    memoryStats: any;
  } | null>(null);

  // Memory management state
  const [memories, setMemories] = useState<
    Array<{ id: string; content: string; importance: number; createdAt: number }>
  >([]);
  const [showMemoryDialog, setShowMemoryDialog] = useState(false);
  const [editingMemory, setEditingMemory] = useState<{
    id: string;
    content: string;
    importance: number;
  } | null>(null);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryImportance, setNewMemoryImportance] = useState(0.5);

  // Tool state
  const [availableTools, setAvailableTools] = useState<
    Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  >([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  // Form state
  const [settings, setSettings] = useState<QuickChatSettingsData>({
    agentId: null,
    modelId: null,
    systemPrompt: '',
    temperature: 0.7,
    memoryEnabled: true,
    memoryMaxCount: 5,
    memoryMinImportance: 0.5,
    autoCreateMemories: true,
  });

  // Load settings and available Agents
  const loadData = async () => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const [settingsResult, agentsResult, configResult, toolsResult] = await Promise.all([
        window.electronAPI.quickChat.getSettings(),
        window.electronAPI.quickChat.getAvailableAgents(),
        window.electronAPI.quickChat.getFullConfig(),
        window.electronAPI.tools.list(),
      ]);

      setSettings({
        agentId: settingsResult.agentId,
        modelId: settingsResult.modelId,
        systemPrompt: settingsResult.systemPrompt || '',
        temperature: settingsResult.temperature,
        memoryEnabled: settingsResult.memoryEnabled,
        memoryMaxCount: settingsResult.memoryMaxCount,
        memoryMinImportance: settingsResult.memoryMinImportance,
        autoCreateMemories: settingsResult.autoCreateMemories,
        selectedTools: settingsResult.selectedTools,
      });

      setAvailableAgents(agentsResult);
      setCurrentConfig(configResult);

      // Load tools
      const toolsArray = Object.entries(toolsResult || {}).map(([name, tool]: [string, any]) => ({
        name,
        description: tool.description || '',
        parameters: tool.parameters || {},
      }));
      setAvailableTools(toolsArray);
      // Load saved tool selection, or default to all tools
      const savedTools = settingsResult.selectedTools as string[] | undefined;
      if (savedTools && savedTools.length > 0) {
        setSelectedTools(
          new Set(savedTools.filter((t) => toolsArray.some((tool) => tool.name === t)))
        );
      } else {
        setSelectedTools(new Set(toolsArray.map((t) => t.name)));
      }
    } catch (error: any) {
      toast.error('Failed to load settings: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Save settings
  const handleSave = async () => {
    if (!window.electronAPI) return;
    setIsSaving(true);
    try {
      const settingsToSave = {
        ...settings,
        selectedTools: Array.from(selectedTools),
      };
      await window.electronAPI.quickChat.updateSettings(
        settingsToSave as unknown as Record<string, unknown>
      );
      toast.success('Settings saved');
      setOpen(false);
      onSettingsChange?.();
      loadData(); // Reload to get latest config
    } catch (error: any) {
      toast.error('Failed to save settings: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset settings
  const handleReset = async () => {
    if (!window.electronAPI) return;
    if (!confirm('Are you sure you want to reset all settings?')) return;

    try {
      await window.electronAPI.quickChat.resetSettings();
      toast.success('Settings reset');
      loadData();
    } catch (error: any) {
      toast.error('Failed to reset settings: ' + error.message);
    }
  };

  // Select Agent
  const handleSelectAgent = async (agentId: string) => {
    if (!window.electronAPI) return;
    const newAgentId = agentId || null; // Convert empty string to null
    try {
      // Update local state first for immediate feedback
      const newSettings = { ...settings, agentId: newAgentId };
      setSettings(newSettings);

      // Async save to backend
      await window.electronAPI.quickChat.setAgent(newAgentId);
      loadMemories(newAgentId || undefined); // Load this agent's memories
    } catch (error: any) {
      toast.error('Failed to set agent: ' + error.message);
      // If failed, reload original state
      loadData();
    }
  };

  // Load memory list
  const loadMemories = async (agentId?: string) => {
    const targetAgentId = agentId || settings.agentId;
    if (!targetAgentId) {
      setMemories([]);
      return;
    }

    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.memory.getAgentMemories(targetAgentId, 50);
      setMemories(result || []);
    } catch (error: any) {
      console.error('Failed to load memories:', error);
      setMemories([]);
    }
  };

  // Add memory
  const handleAddMemory = async () => {
    if (!settings.agentId) {
      toast.error('Please select an agent first');
      return;
    }
    if (!newMemoryContent.trim()) {
      toast.error('Please enter memory content');
      return;
    }

    if (!window.electronAPI) return;
    try {
      // Use smart memory creation
      const result = await window.electronAPI.memory.smartCreate(
        settings.agentId,
        newMemoryContent,
        {
          importance: newMemoryImportance,
        }
      );

      if (result.success) {
        toast.success('Memory added');
        setNewMemoryContent('');
        setNewMemoryImportance(0.5);
        setShowMemoryDialog(false);
        loadMemories();
      } else {
        toast.warning(result.reason || 'Failed to add');
      }
    } catch (error: any) {
      toast.error('Failed to add memory: ' + error.message);
    }
  };

  // Edit memory
  const handleEditMemory = async () => {
    if (!editingMemory) return;
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.memory.update(editingMemory.id, {
        content: editingMemory.content,
        importance: editingMemory.importance,
      });
      toast.success('Memory updated');
      setEditingMemory(null);
      loadMemories();
    } catch (error: any) {
      toast.error('Failed to update memory: ' + error.message);
    }
  };

  // Delete memory
  const handleDeleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.memory.delete(memoryId);
      toast.success('Memory deleted');
      loadMemories();
    } catch (error: any) {
      toast.error('Failed to delete memory: ' + error.message);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
      if (settings.agentId) {
        loadMemories(settings.agentId);
      }
    }
  }, [open]);

  const selectedAgent = availableAgents.find((a) => a.id === settings.agentId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4 mr-1" />
            Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Quick Chat Settings
          </DialogTitle>
          <DialogDescription>
            Configure Quick Chat agent, memory and behavior settings
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 px-6">
            <div className="text-center text-muted-foreground">Loading...</div>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6 py-4 max-h-[calc(85vh-140px)]">
            <div className="space-y-6">
              {/* Current config overview */}
              {currentConfig && (
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Current Config
                  </h3>
                  <div className="space-y-1 text-sm">
                    {currentConfig.agentInfo ? (
                      <div className="flex items-center justify-between">
                        <span>Agent:</span>
                        <span className="font-medium">{currentConfig.agentInfo.name}</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground italic">
                        No agent selected (using global default)
                      </div>
                    )}
                    {currentConfig.memoryStats && (
                      <div className="flex items-center justify-between">
                        <span>Memory Count:</span>
                        <span className="font-medium">
                          {currentConfig.memoryStats.totalMemories}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Agent selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Select Agent</Label>
                  {settings.agentId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectAgent(null as any)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Select value={settings.agentId || ''} onValueChange={handleSelectAgent}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an Agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <div>
                            <div className="font-medium">{agent.name}</div>
                            {agent.description && (
                              <div className="text-xs text-muted-foreground">
                                {agent.description}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {agent.memoryCount} memories
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedAgent && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                    <div className="flex items-start gap-2 text-sm">
                      <Bot className="w-4 h-4 mt-0.5 text-blue-500" />
                      <div className="space-y-1">
                        <div className="font-medium">Selected {selectedAgent.name}</div>
                        {selectedAgent.description && (
                          <div className="text-muted-foreground text-xs">
                            {selectedAgent.description}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Has {selectedAgent.memoryCount} memories
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom system prompt */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Custom System Prompt</Label>
                <Textarea
                  placeholder="Enter custom system prompt, leave empty to use agent default"
                  value={settings.systemPrompt || ''}
                  onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Custom prompt will override the agent&apos;s default prompt
                </p>
              </div>

              {/* Temperature settings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">
                    Temperature: {settings.temperature.toFixed(1)}
                  </Label>
                </div>
                <Slider
                  value={[settings.temperature]}
                  onValueChange={(v) => setSettings({ ...settings, temperature: v[0] })}
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Precise (0)</span>
                  <span>Creative (2)</span>
                </div>
              </div>

              {/* Tool selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Available Tools
                    <span className="text-xs font-normal text-muted-foreground">
                      ({selectedTools.size} / {availableTools.length} selected)
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTools(new Set(availableTools.map((t) => t.name)))}
                    >
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedTools(new Set())}>
                      Clear
                    </Button>
                  </div>
                </div>
                {availableTools.length > 0 ? (
                  <div className="p-4 bg-muted/50 rounded-lg border max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-2">
                      {availableTools.map((tool) => {
                        const isSelected = selectedTools.has(tool.name);
                        const displayName = tool.name.replace(/_/g, ' ');
                        return (
                          <button
                            key={tool.name}
                            onClick={() => {
                              const newSelected = new Set(selectedTools);
                              if (isSelected) {
                                newSelected.delete(tool.name);
                              } else {
                                newSelected.add(tool.name);
                              }
                              setSelectedTools(newSelected);
                            }}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
                              isSelected
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:bg-muted'
                            }`}
                          >
                            <div
                              className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center ${
                                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{displayName}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {tool.description || 'No description'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No tools available
                  </div>
                )}
              </div>

              {/* Memory settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Memory Feature
                  </Label>
                  <Switch
                    checked={settings.memoryEnabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, memoryEnabled: checked })
                    }
                  />
                </div>

                {settings.memoryEnabled && (
                  <div className="space-y-4 pl-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">
                          Max Memory Count: {settings.memoryMaxCount}
                        </Label>
                      </div>
                      <Slider
                        value={[settings.memoryMaxCount]}
                        onValueChange={(v) => setSettings({ ...settings, memoryMaxCount: v[0] })}
                        min={1}
                        max={20}
                        step={1}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">
                          Min Importance: {settings.memoryMinImportance.toFixed(1)}
                        </Label>
                      </div>
                      <Slider
                        value={[settings.memoryMinImportance]}
                        onValueChange={(v) =>
                          setSettings({ ...settings, memoryMinImportance: v[0] })
                        }
                        min={0}
                        max={1}
                        step={0.1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>All</span>
                        <span>Important Only</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-create memories */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base font-medium">Auto Create Memories</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically extract important information from conversations and save as
                    memories
                  </p>
                </div>
                <Switch
                  checked={settings.autoCreateMemories}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, autoCreateMemories: checked })
                  }
                />
              </div>

              {/* Memory management */}
              {settings.agentId && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      Memory Management
                      <span className="text-xs font-normal text-muted-foreground">
                        ({memories.length} entries)
                      </span>
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMemoryDialog(true)}
                      className="gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Memory
                    </Button>
                  </div>

                  {memories.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {memories.map((memory) => (
                        <div
                          key={memory.id}
                          className="p-3 bg-muted/50 rounded-lg border group hover:bg-muted transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {memory.content}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Importance: {(memory.importance * 100).toFixed(0)}%</span>
                                <span>•</span>
                                <span>{new Date(memory.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() =>
                                  setEditingMemory({
                                    id: memory.id,
                                    content: memory.content,
                                    importance: memory.importance,
                                  })
                                }
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteMemory(memory.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No memories yet, click the button above to add
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex justify-between px-6 pb-6 pt-2 border-t">
          <Button variant="ghost" onClick={handleReset} disabled={isLoading || isSaving}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading || isSaving}>
              {isSaving ? (
                <>
                  <span className="animate-spin mr-1">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Add/Edit memory dialog */}
      <Dialog
        open={showMemoryDialog || editingMemory !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowMemoryDialog(false);
            setEditingMemory(null);
            setNewMemoryContent('');
            setNewMemoryImportance(0.5);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMemory ? 'Edit Memory' : 'Add Memory'}</DialogTitle>
            <DialogDescription>
              {editingMemory
                ? 'Modify memory content and importance'
                : 'Add a new memory for Quick Chat Agent'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="memory-content">Memory Content</Label>
              <Textarea
                id="memory-content"
                placeholder="Enter content to remember..."
                value={editingMemory ? editingMemory.content : newMemoryContent}
                onChange={(e) =>
                  editingMemory
                    ? setEditingMemory({ ...editingMemory, content: e.target.value })
                    : setNewMemoryContent(e.target.value)
                }
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="memory-importance">Importance</Label>
                <span className="text-sm text-muted-foreground">
                  {Math.round(
                    (editingMemory ? editingMemory.importance : newMemoryImportance) * 100
                  )}
                  %
                </span>
              </div>
              <Slider
                id="memory-importance"
                value={[editingMemory ? editingMemory.importance : newMemoryImportance]}
                onValueChange={(v) =>
                  editingMemory
                    ? setEditingMemory({ ...editingMemory, importance: v[0] })
                    : setNewMemoryImportance(v[0])
                }
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMemoryDialog(false);
                setEditingMemory(null);
                setNewMemoryContent('');
                setNewMemoryImportance(0.5);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingMemory ? handleEditMemory : handleAddMemory}
              disabled={!editingMemory && !newMemoryContent.trim()}
            >
              {editingMemory ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/**
 * Quick Chat Agent Selector
 * Quick switch for Quick Chat Agent
 */
interface QuickChatAgentSelectorProps {
  currentAgentId?: string | null;
  onAgentChange?: (agentId: string | null) => void;
  showStats?: boolean;
  variant?: 'default' | 'compact' | 'minimal';
}

export function QuickChatAgentSelector({
  currentAgentId: propAgentId,
  onAgentChange,
  showStats = true,
  variant = 'default',
}: QuickChatAgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(propAgentId || null);

  const loadAgents = async () => {
    if (!window.electronAPI) return;
    setIsLoading(true);
    try {
      const [agentsResult, settingsResult] = await Promise.all([
        window.electronAPI.quickChat.getAvailableAgents(),
        window.electronAPI.quickChat.getSettings(),
      ]);
      setAgents(agentsResult);
      setCurrentAgentId(settingsResult.agentId || null);
    } catch (error: any) {
      console.error('Failed to load agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAgent = async (agentId: string) => {
    if (!window.electronAPI) return;
    const newAgentId = agentId || null; // Convert empty string to null
    try {
      // Update local state first
      setCurrentAgentId(newAgentId);
      onAgentChange?.(newAgentId);
      setIsOpen(false);

      // Async save to backend
      await window.electronAPI.quickChat.setAgent(newAgentId);
    } catch (error: any) {
      toast.error('Failed to set agent: ' + error.message);
      // If failed, reload original state
      loadAgents();
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const currentAgent = agents.find((a) => a.id === currentAgentId);

  if (variant === 'minimal') {
    return (
      <Select value={currentAgentId || ''} onValueChange={handleSelectAgent}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select Agent..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Default Agent</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant === 'compact' ? 'ghost' : 'default'} size="sm" className="gap-1">
          <Bot className="w-4 h-4" />
          {currentAgent ? currentAgent.name : 'Select Agent'}
          {variant !== 'compact' && <ChevronRight className="w-4 h-4" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Quick Chat Agent</DialogTitle>
          <DialogDescription>
            Select a dedicated agent for Quick Chat, its memory and configuration will be used
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelectAgent(agent.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-accent ${
                  currentAgentId === agent.id ? 'border-primary bg-accent' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">{agent.name}</div>
                    {agent.description && (
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {agent.description}
                      </div>
                    )}
                  </div>
                  {showStats && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      {agent.memoryCount}
                    </div>
                  )}
                </div>
              </button>
            ))}

            {agents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No agents available, please create one in the Agents page first
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
