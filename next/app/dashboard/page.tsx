'use client';

/**
 * Dashboard Page
 *
 * Main dashboard with proactive content panel and quick access to all features.
 */

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { ProactiveContentPanel } from '@/components/evolution/proactive-content';
import { SmartSuggestions } from '@/components/evolution/smart-suggestions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Zap, MessageSquare, Workflow, Settings, TrendingUp } from 'lucide-react';

interface QuickStats {
  totalMessages: number;
  workflowsCreated: number;
  skillsInstalled: number;
  activeTasks: number;
}

interface LearningData {
  patternsDetected: number;
  activePredictions: number;
  contentDelivered: number;
  totalEvents: number;
  topIntents: Array<{
    type: string;
    topic: string;
    confidence: number;
    timesDetected: number;
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<QuickStats>({
    totalMessages: 0,
    workflowsCreated: 0,
    skillsInstalled: 0,
    activeTasks: 0,
  });

  const [learning, setLearning] = useState<LearningData>({
    patternsDetected: 0,
    activePredictions: 0,
    contentDelivered: 0,
    totalEvents: 0,
    topIntents: [],
  });

  const [learningLoaded, setLearningLoaded] = useState(false);

  useEffect(() => {
    loadStats();
    loadLearningInsights();
    trackPageView();
  }, []);

  const loadStats = async () => {
    try {
      // Get various stats
      const [sessions, workflows, skills, scheduled] = await Promise.all([
        window.electronAPI?.sessions?.list?.(),
        window.electronAPI?.workflows?.list?.(),
        window.electronAPI?.skills?.list?.(),
        window.electronAPI?.scheduled?.list?.(),
      ]);

      setStats({
        totalMessages: sessions?.length || 0,
        workflowsCreated: workflows?.length || 0,
        skillsInstalled: skills?.filter((s: any) => s.enabled)?.length || 0,
        activeTasks: scheduled?.filter((t: any) => t.enabled)?.length || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadLearningInsights = async () => {
    try {
      const data = await window.electronAPI?.evolution?.getLearningInsights?.();
      if (data) {
        setLearning({
          patternsDetected: data.patternsDetected ?? 0,
          activePredictions: data.activePredictions ?? 0,
          contentDelivered: data.contentDelivered ?? 0,
          totalEvents: data.totalEvents ?? 0,
          topIntents: data.topIntents || [],
        });
      }
    } catch (error) {
      console.error('Failed to load learning insights:', error);
    } finally {
      setLearningLoaded(true);
    }
  };

  const trackPageView = async () => {
    try {
      await window.electronAPI?.evolution?.trackEvent?.('page_view', {
        page: 'dashboard',
      });
    } catch {
      // silently ignore tracking errors
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome to DeskClaw - Your AI-powered assistant
            </p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = '/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Total Messages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMessages}</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Workflow className="h-4 w-4" />
                Workflows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.workflowsCreated}</div>
              <p className="text-xs text-muted-foreground mt-1">Created</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Skills
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.skillsInstalled}</div>
              <p className="text-xs text-muted-foreground mt-1">Installed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Scheduled Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">Active</p>
            </CardContent>
          </Card>
        </div>

        {/* Evolution Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Proactive Content */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  Proactive Updates
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    AI-powered automatic updates
                  </span>
                </CardTitle>
                <CardDescription>
                  DeskClaw learns your patterns and automatically delivers content you need
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProactiveContentPanel />
              </CardContent>
            </Card>
          </div>

          {/* Smart Suggestions */}
          <div>
            <SmartSuggestions />
          </div>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center gap-2"
                onClick={() => {
                  window.electronAPI?.evolution?.trackEvent?.('click', { elementId: 'quick-chat' });
                  window.location.href = '/chat';
                }}
              >
                <MessageSquare className="h-5 w-5" />
                <span className="text-sm">Quick Chat</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center gap-2"
                onClick={() => {
                  window.electronAPI?.evolution?.trackEvent?.('click', { elementId: 'workflows' });
                  window.location.href = '/workflows';
                }}
              >
                <Workflow className="h-5 w-5" />
                <span className="text-sm">Workflows</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center gap-2"
                onClick={() => {
                  window.electronAPI?.evolution?.trackEvent?.('click', { elementId: 'memory' });
                  window.location.href = '/memory';
                }}
              >
                <Zap className="h-5 w-5" />
                <span className="text-sm">Memory</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center gap-2"
                onClick={() => {
                  window.electronAPI?.evolution?.trackEvent?.('click', { elementId: 'scheduled' });
                  window.location.href = '/scheduled';
                }}
              >
                <Activity className="h-5 w-5" />
                <span className="text-sm">Scheduled</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Learning Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Learning Progress
              {learningLoaded && learning.totalEvents > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {learning.totalEvents} events tracked
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Patterns detected</span>
                <span className="font-medium">{learning.patternsDetected}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Active predictions</span>
                <span className="font-medium">{learning.activePredictions}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Content delivered</span>
                <span className="font-medium">{learning.contentDelivered}</span>
              </div>
              {learning.topIntents.length > 0 && (
                <>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Top Learned Patterns
                    </p>
                    <div className="space-y-2">
                      {learning.topIntents.slice(0, 3).map((intent, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{intent.topic}</span>
                          <span className="font-medium">
                            {Math.round(intent.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                {learning.totalEvents > 0
                  ? `Learning from ${learning.totalEvents} tracked events to improve predictions`
                  : 'Start using features to generate learning data'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
