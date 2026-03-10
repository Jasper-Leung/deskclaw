'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Trash2,
  Power,
  PowerOff,
  MessageCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface Channel {
  id: string;
  channel_type: string;
  account_id: string;
  name: string;
  enabled: number;
  config_json: string;
  created_at: number;
  updated_at: number;
}

interface ChannelType {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: {
    chatTypes: Array<'direct' | 'group' | 'channel' | 'thread'>;
    media?: boolean;
    reactions?: boolean;
    polls?: boolean;
    nativeCommands?: boolean;
    blockStreaming?: boolean;
  };
  defaultConfig: Record<string, unknown>;
  configSchema: Array<{
    key: string;
    type: 'text' | 'password' | 'number' | 'boolean' | 'textarea' | 'select';
    label: string;
    placeholder?: string;
    required: boolean;
    hint?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

interface ChannelMessage {
  id: string;
  channelId: string;
  messageId: string;
  peerId: string;
  peerType: string;
  direction: string;
  content?: string;
  media?: { type: string; url: string; caption?: string };
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTypes, setChannelTypes] = useState<ChannelType[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    loadChannels();
    loadChannelTypes();
  }, []);

  const loadChannels = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.channels.list();
        setChannels(data);
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  };

  const loadChannelTypes = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.channels.types();
        setChannelTypes(data);
      }
    } catch (error) {
      console.error('Failed to load channel types:', error);
    }
  };

  const handleToggle = async (channel: Channel) => {
    try {
      if (window.electronAPI) {
        if (channel.enabled) {
          await window.electronAPI.channels.stop(channel.id);
        } else {
          await window.electronAPI.channels.start(channel.id);
        }
        await loadChannels();
      }
    } catch (error) {
      console.error('Failed to toggle channel:', error);
      alert(error instanceof Error ? error.message : 'Failed to toggle channel');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.channels.delete(id);
        await loadChannels();
      }
    } catch (error) {
      console.error('Failed to delete channel:', error);
    }
  };

  const handleTestConnection = async (channelType: string, config: Record<string, unknown>) => {
    setIsTesting(true);
    setTestResult(null);

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.channels.test(channelType, JSON.stringify(config));
        setTestResult(result);
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      if (window.electronAPI) {
        // For now, load recent messages (empty peerId for all)

        const data = await window.electronAPI.channels.messages(channelId, '', 100);
        setMessages(data);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Message Channels</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect and manage messaging platforms
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Channel
          </Button>
        </div>

        {channels.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No channels configured</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add a messaging platform to get started
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => {
              const channelType = channelTypes.find((t) => t.id === channel.channel_type);
              return (
                <div key={channel.id} className="flex flex-col rounded-lg border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MessageCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{channel.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {channelType?.name || channel.channel_type}
                        </p>
                      </div>
                    </div>
                    <Badge variant={channel.enabled ? 'default' : 'secondary'}>
                      {channel.enabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <Button variant="outline" size="sm" onClick={() => handleToggle(channel)}>
                      {channel.enabled ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedChannel(channel);
                        loadMessages(channel.id);
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(channel.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Channel Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Message Channel</DialogTitle>
              <DialogDescription>
                Connect a messaging platform to send and receive messages
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto -mx-6 px-6">
              <AddChannelForm
                channelTypes={channelTypes}
                onSave={async (data) => {
                  try {
                    if (window.electronAPI) {
                      await window.electronAPI.channels.create(data);
                      await loadChannels();
                      setShowAddDialog(false);
                    }
                  } catch (error) {
                    console.error('Failed to create channel:', error);
                    alert(error instanceof Error ? error.message : 'Failed to create channel');
                  }
                }}
                onCancel={() => setShowAddDialog(false)}
                onTest={handleTestConnection}
                testResult={testResult}
                isTesting={isTesting}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Messages Dialog */}
        <Dialog open={!!selectedChannel} onOpenChange={() => setSelectedChannel(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Messages: {selectedChannel?.name}</DialogTitle>
              <DialogDescription>Recent message history</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 p-3 rounded-lg ${
                      msg.direction === 'inbound' ? 'bg-muted/50' : 'bg-primary/10'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {msg.direction === 'inbound' ? (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Power className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {msg.direction === 'inbound' ? 'Received' : 'Sent'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {msg.content && <p className="text-sm">{msg.content}</p>}
                      {msg.media && (
                        <div className="text-sm text-muted-foreground">
                          [{msg.media.type}] {msg.media.caption}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function AddChannelForm({
  channelTypes,
  onSave,
  onCancel,
  onTest,
  testResult,
  isTesting,
}: {
  channelTypes: ChannelType[];
  onSave: (data: {
    channelType: string;
    accountId: string;
    name: string;
    configJson: string;
  }) => void;
  onCancel: () => void;
  onTest: (channelType: string, config: Record<string, unknown>) => void;
  testResult: { success: boolean; error?: string } | null;
  isTesting: boolean;
}) {
  const [channelType, setChannelType] = useState('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});

  const selectedType = channelTypes.find((t) => t.id === channelType);

  // Reset config when channel type changes
  useEffect(() => {
    if (selectedType) {
      const defaultConfig: Record<string, string> = {};
      selectedType.configSchema.forEach((field) => {
        defaultConfig[field.key] = '';
      });
      setConfig(defaultConfig);
      setName(selectedType.name);
    }
  }, [channelType, selectedType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      channelType,
      accountId: crypto.randomUUID(),
      name: name || selectedType?.name || 'New Channel',
      configJson: JSON.stringify(config),
    });
  };

  const handleTest = () => {
    onTest(channelType, config);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="channelType">Platform</Label>
        <Select value={channelType} onValueChange={setChannelType}>
          <SelectTrigger>
            <SelectValue placeholder="Select messaging platform" />
          </SelectTrigger>
          <SelectContent>
            {channelTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  <span>{type.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedType?.description && (
          <p className="text-xs text-muted-foreground">{selectedType.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Channel Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={selectedType?.name}
        />
      </div>

      {selectedType?.configSchema.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{field.label}</Label>
          {field.type === 'textarea' ? (
            <Textarea
              id={field.key}
              value={config[field.key] || ''}
              onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              required={field.required}
            />
          ) : field.type === 'password' ? (
            <Input
              id={field.key}
              type="password"
              value={config[field.key] || ''}
              onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              required={field.required}
            />
          ) : field.type === 'select' ? (
            <Select
              value={config[field.key] || ''}
              onValueChange={(value) => setConfig({ ...config, [field.key]: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={field.key}
              type={field.type === 'number' ? 'number' : 'text'}
              value={config[field.key] || ''}
              onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}
          {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
        </div>
      ))}

      {/* Capabilities Display */}
      {selectedType?.capabilities && (
        <div className="space-y-2">
          <Label>Capabilities</Label>
          <div className="flex flex-wrap gap-2">
            {selectedType.capabilities.chatTypes.map((type) => (
              <Badge key={type} variant="outline" className="text-xs">
                {type}
              </Badge>
            ))}
            {selectedType.capabilities.media && (
              <Badge variant="outline" className="text-xs">
                Media
              </Badge>
            )}
            {selectedType.capabilities.reactions && (
              <Badge variant="outline" className="text-xs">
                Reactions
              </Badge>
            )}
            {selectedType.capabilities.polls && (
              <Badge variant="outline" className="text-xs">
                Polls
              </Badge>
            )}
            {selectedType.capabilities.nativeCommands && (
              <Badge variant="outline" className="text-xs">
                Commands
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Test Connection */}
      {channelType && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={isTesting}
            className="w-full"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </Button>
          {testResult && (
            <div
              className={`flex items-center gap-2 text-sm p-2 rounded ${
                testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}
            >
              {testResult.success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Connection successful!
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  {testResult.error || 'Connection failed'}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 pt-4 bg-background border-t -mx-6 px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create Channel</Button>
      </div>
    </form>
  );
}
