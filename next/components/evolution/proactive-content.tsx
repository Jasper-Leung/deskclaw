'use client';

/**
 * Proactive Content Delivery Component
 *
 * Displays automatically delivered content from predictive tasks.
 */

import React, { useState, useEffect } from 'react';
import { Bell, X, Check, Clock, TrendingUp, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface PredictedTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  estimatedValue: number;
  enabled: boolean;
  nextRun?: string;
  lastRun?: string;
}

interface DeliveredContent {
  id: string;
  taskId: string;
  type: 'notification' | 'chat_message' | 'dashboard_update';
  title: string;
  body: string;
  timestamp: number;
  viewed: boolean;
  feedback?: 'positive' | 'neutral' | 'negative';
}

export function ProactiveContentPanel() {
  const [tasks, setTasks] = useState<PredictedTask[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveredContent[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Listen for new content deliveries
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'evolution:content-delivery') {
        handleNewDelivery(event.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksData, deliveriesData] = await Promise.all([
        window.electronAPI?.evolution?.getPredictedTasks?.(),
        window.electronAPI?.evolution?.getDeliveries?.(),
      ]);
      setTasks(tasksData || []);
      setDeliveries(deliveriesData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewDelivery = (data: any) => {
    const newDelivery: DeliveredContent = {
      id: Math.random().toString(),
      taskId: data.taskId || '',
      type: data.type,
      title: data.title,
      body: data.content || data.body,
      timestamp: Date.now(),
      viewed: false,
    };
    setDeliveries((prev) => [newDelivery, ...prev]);
  };

  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      await window.electronAPI?.evolution?.togglePredictedTask?.(taskId, enabled);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, enabled } : t)));
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await window.electronAPI?.evolution?.deletePredictedTask?.(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleFeedback = async (deliveryId: string, feedback: 'positive' | 'negative') => {
    try {
      await window.electronAPI?.evolution?.provideDeliveryFeedback?.(deliveryId, feedback);
      setDeliveries((prev) => prev.map((d) => (d.id === deliveryId ? { ...d, feedback } : d)));
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const handleDismiss = (deliveryId: string) => {
    setDeliveries((prev) => prev.filter((d) => d.id !== deliveryId));
  };

  const undeliveredCount = deliveries.filter((d) => !d.viewed).length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Proactive Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="relative">
              <Bell className="h-5 w-5" />
              {undeliveredCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                  {undeliveredCount}
                </span>
              )}
            </div>
            Proactive Updates
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>Automatic updates based on your usage patterns</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {showSettings ? (
          <TaskSettings
            tasks={tasks}
            onToggle={handleToggleTask}
            onDelete={handleDeleteTask}
            onClose={() => setShowSettings(false)}
          />
        ) : (
          <>
            {deliveries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No proactive updates yet</p>
                <p className="text-sm mt-1">
                  DeskClaw will learn your patterns and start delivering updates
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {deliveries.slice(0, 5).map((delivery) => (
                  <DeliveryCard
                    key={delivery.id}
                    delivery={delivery}
                    onFeedback={handleFeedback}
                    onDismiss={handleDismiss}
                  />
                ))}
                {deliveries.length > 5 && (
                  <Button variant="ghost" className="w-full" onClick={() => setShowSettings(true)}>
                    View all {deliveries.length} updates
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface TaskSettingsProps {
  tasks: PredictedTask[];
  onToggle: (taskId: string, enabled: boolean) => void;
  onDelete: (taskId: string) => void;
  onClose: () => void;
}

function TaskSettings({ tasks, onToggle, onDelete, onClose }: TaskSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Scheduled Tasks</h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No automatic tasks configured yet. DeskClaw is still learning your patterns.
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h5 className="font-medium text-sm">{task.name}</h5>
                    {task.enabled ? (
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{task.description}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.cronExpression}
                    </span>
                    {task.estimatedValue > 0.7 && (
                      <span className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="h-3 w-3" />
                        High value
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Switch
                    checked={task.enabled}
                    onCheckedChange={(checked) => onToggle(task.id, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => onDelete(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-3 border-t">
        <p className="text-xs text-muted-foreground mb-2">
          💡 Tasks are automatically generated based on your usage patterns
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

interface DeliveryCardProps {
  delivery: DeliveredContent;
  onFeedback: (id: string, feedback: 'positive' | 'negative') => void;
  onDismiss: (id: string) => void;
}

function DeliveryCard({ delivery, onFeedback, onDismiss }: DeliveryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (delivery.type) {
      case 'notification':
        return <Bell className="h-4 w-4 text-blue-500" />;
      case 'chat_message':
        return <div className="h-4 w-4 rounded-full bg-green-500" />;
      case 'dashboard_update':
        return <TrendingUp className="h-4 w-4 text-purple-500" />;
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div
      className={`border rounded-lg p-3 transition-colors ${!delivery.viewed ? 'bg-accent/50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-sm truncate">{delivery.title}</h4>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {getTimeAgo(delivery.timestamp)}
            </span>
          </div>

          <p className={`text-sm mt-1 ${!expanded ? 'line-clamp-2' : ''}`}>{delivery.body}</p>

          {delivery.body.length > 100 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {/* Feedback buttons */}
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 ${delivery.feedback === 'positive' ? 'bg-green-100 text-green-700' : ''}`}
              onClick={() => onFeedback(delivery.id, 'positive')}
            >
              <Check className="h-3 w-3 mr-1" />
              Helpful
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 ${delivery.feedback === 'negative' ? 'bg-red-100 text-red-700' : ''}`}
              onClick={() => onFeedback(delivery.id, 'negative')}
            >
              <X className="h-3 w-3 mr-1" />
              Not helpful
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onDismiss(delivery.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Example of how new content delivery looks
export function ProactiveContentExample() {
  const [exampleDeliveries] = useState<DeliveredContent[]>([
    {
      id: '1',
      taskId: 'task-1',
      type: 'chat_message',
      title: 'Daily Tech News Summary',
      body: "Here are today's top tech stories:\n\n1. AI breakthrough in natural language understanding...\n2. New framework released for building...\n3. Major security update for...",
      timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      viewed: false,
    },
    {
      id: '2',
      taskId: 'task-2',
      type: 'dashboard_update',
      title: 'Weekly Report Generated',
      body: 'Your weekly activity report is ready. You processed 147 workflows this week, up 12% from last week.',
      timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
      viewed: false,
    },
    {
      id: '3',
      taskId: 'task-3',
      type: 'notification',
      title: 'System Health Check',
      body: 'All systems operational. Database size: 245MB, Uptime: 7 days',
      timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
      viewed: true,
      feedback: 'positive',
    },
  ]);

  const [exampleTasks] = useState<PredictedTask[]>([
    {
      id: 'task-1',
      name: 'Morning Tech News',
      description: 'Daily tech news summary at 9:00 AM',
      cronExpression: '0 9 * * *',
      estimatedValue: 0.9,
      enabled: true,
      nextRun: 'Tomorrow at 9:00 AM',
      lastRun: 'Today at 9:00 AM',
    },
    {
      id: 'task-2',
      name: 'Weekly Activity Report',
      description: 'Generate weekly usage report every Monday',
      cronExpression: '0 9 * * 1',
      estimatedValue: 0.8,
      enabled: true,
      nextRun: 'Next Monday at 9:00 AM',
      lastRun: 'Last Monday at 9:00 AM',
    },
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Proactive Content Example</h3>
        <p className="text-sm text-muted-foreground">
          This is how automatic content delivery looks
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exampleDeliveries.map((delivery) => (
            <div key={delivery.id} className="border rounded-lg p-3">
              <div className="flex items-start gap-3">
                <Bell className="h-4 w-4 text-blue-500 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{delivery.title}</h4>
                    <span className="text-xs text-muted-foreground">
                      {Math.floor((Date.now() - delivery.timestamp) / 60000)}m ago
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{delivery.body}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {exampleTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between p-2 border rounded-lg">
              <div>
                <h4 className="font-medium text-sm">{task.name}</h4>
                <p className="text-xs text-muted-foreground">{task.lastRun}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-600">Next: {task.nextRun}</span>
                <Switch checked={task.enabled} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
