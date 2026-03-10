/**
 * Memory Management Component
 * 用于显示和管理 Agent 的记忆
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Trash2, Search, Plus, Brain, Star, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Memory {
  id: string;
  agent_id: string;
  content: string;
  importance: number;
  created_at: number;
}

interface MemoryManagerProps {
  agentId: string;
  agentName: string;
}

export function MemoryManager({ agentId, agentName }: MemoryManagerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filteredMemories, setFilteredMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minImportance, setMinImportance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryImportance, setNewMemoryImportance] = useState(0.5);

  // 加载记忆
  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.memory.getAgentMemories(agentId, 100);
      setMemories(result || []);
      setFilteredMemories(result || []);
    } catch (error: any) {
      toast.error('加载记忆失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 创建记忆
  const createMemory = async () => {
    if (!newMemoryContent.trim()) {
      toast.error('请输入记忆内容');
      return;
    }

    try {
      await window.electronAPI?.memory.create({
        agentId,
        content: newMemoryContent,
        importance: newMemoryImportance,
      });
      toast.success('记忆创建成功');
      setNewMemoryContent('');
      setNewMemoryImportance(0.5);
      setCreateDialogOpen(false);
      loadMemories();
    } catch (error: any) {
      toast.error('创建记忆失败: ' + error.message);
    }
  };

  // 删除记忆
  const deleteMemory = async (memoryId: string) => {
    try {
      await window.electronAPI?.memory.delete(memoryId);
      toast.success('记忆已删除');
      loadMemories();
    } catch (error: any) {
      toast.error('删除记忆失败: ' + error.message);
    }
  };

  // 搜索和筛选
  useEffect(() => {
    let filtered = memories;

    // 按搜索词筛选
    if (searchQuery) {
      filtered = filtered.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 按重要性筛选
    filtered = filtered.filter((m) => m.importance >= minImportance);

    setFilteredMemories(filtered);
  }, [memories, searchQuery, minImportance]);

  // 组件加载时获取记忆
  useEffect(() => {
    loadMemories();
  }, [agentId]);

  // 获取记忆统计
  const stats = {
    total: memories.length,
    highImportance: memories.filter((m) => m.importance >= 0.8).length,
    lowImportance: memories.filter((m) => m.importance < 0.3).length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold">{agentName} 的记忆</h2>
          <span className="text-sm text-muted-foreground">({stats.total} 条)</span>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              添加记忆
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新记忆</DialogTitle>
              <DialogDescription>
                为 {agentName} 添加一条新的记忆，这将帮助 AI 在未来的对话中记住重要信息。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="memory-content">记忆内容</Label>
                <textarea
                  id="memory-content"
                  className="w-full min-h-[100px] p-2 border rounded-md resize-none"
                  placeholder="输入要记住的内容..."
                  value={newMemoryContent}
                  onChange={(e) => setNewMemoryContent(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="memory-importance">重要性: {newMemoryImportance.toFixed(2)}</Label>
                <Slider
                  id="memory-importance"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[newMemoryImportance]}
                  onValueChange={(v) => setNewMemoryImportance(v[0])}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>低</span>
                  <span>高</span>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={createMemory}>创建</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col gap-3 p-4 border-b">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索记忆..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">最低重要性: {minImportance.toFixed(1)}</Label>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.1}
            value={[minImportance]}
            onValueChange={(v) => setMinImportance(v[0])}
          />
        </div>
      </div>

      {/* 记忆列表 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">加载中...</div>
          ) : filteredMemories.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchQuery || minImportance > 0 ? '没有找到匹配的记忆' : '暂无记忆'}
            </div>
          ) : (
            filteredMemories.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} onDelete={deleteMemory} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* 底部统计 */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center justify-between text-sm">
          <span>高重要性: {stats.highImportance}</span>
          <span>总计: {stats.total}</span>
        </div>
      </div>
    </div>
  );
}

interface MemoryCardProps {
  memory: Memory;
  onDelete: (id: string) => void;
}

function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(memory.content);

  const handleSave = async () => {
    try {
      await window.electronAPI?.memory.update(memory.id, { content: editedContent });
      setIsEditing(false);
      // 父组件会重新加载
    } catch (error: any) {
      toast.error('更新记忆失败: ' + error.message);
    }
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 0.8) return 'text-red-500';
    if (importance >= 0.5) return 'text-yellow-500';
    return 'text-gray-400';
  };

  const getImportanceIcon = (importance: number) => {
    if (importance >= 0.8) return <Star className="w-3 h-3 fill-current" />;
    if (importance >= 0.5) return <Star className="w-3 h-3" />;
    return <Star className="w-3 h-3 opacity-30" />;
  };

  return (
    <div className="p-3 border rounded-lg bg-card space-y-2 hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {getImportanceIcon(memory.importance)}
            <span className={getImportanceColor(memory.importance)}>
              {(memory.importance * 100).toFixed(0)}%
            </span>
            <span>•</span>
            <span>{new Date(memory.created_at).toLocaleDateString()}</span>
          </div>

          {isEditing ? (
            <textarea
              className="w-full min-h-[60px] p-2 text-sm border rounded resize-none"
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
            />
          ) : (
            <p
              className={`text-sm whitespace-pre-wrap break-words cursor-pointer ${
                !isExpanded && 'line-clamp-2'
              }`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {memory.content}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={handleSave}>
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditedContent(memory.content);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(memory.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
