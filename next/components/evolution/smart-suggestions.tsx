'use client';

/**
 * Smart Evolution Suggestions Panel
 *
 * Displays AI-powered suggestions for optimizing workflows and improving productivity.
 */

import React, { useState, useEffect } from 'react';
import { Lightbulb, Zap, TrendingUp, AlertTriangle, X, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface Suggestion {
  id: string;
  type: 'optimization' | 'automation' | 'warning' | 'opportunity';
  title: string;
  description: string;
  priority: number; // 0-1
  actionable: boolean;
  suggestedActions?: SuggestedAction[];
  estimatedImpact?: string;
  confidence: number;
}

interface SuggestedAction {
  type: 'workflow' | 'setting' | 'automation';
  description: string;
  estimatedImpact?: string;
}

interface SmartSuggestionsProps {
  className?: string;
}

export function SmartSuggestions({ className = '' }: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSuggestions();
    // Refresh suggestions every minute
    const interval = setInterval(loadSuggestions, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      // This would call your IPC handler
      const response = await window.electronAPI?.evolution?.getSuggestions();
      if (response) {
        setSuggestions(response);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = (id: string) => {
    setDismissed(new Set(dismissed).add(id));
    // Send dismiss event to backend
    window.electronAPI?.evolution?.dismissSuggestion(id);
  };

  const handleApply = async (suggestion: Suggestion) => {
    try {
      await window.electronAPI?.evolution?.applySuggestion(
        suggestion.id,
        suggestion.suggestedActions || []
      );
      // Refresh suggestions after applying
      await loadSuggestions();
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    }
  };

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Smart Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visibleSuggestions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-green-500" />
            Smart Suggestions
          </CardTitle>
          <CardDescription>All caught up! No new suggestions.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Smart Suggestions
          </span>
          <Badge variant="secondary">{visibleSuggestions.length}</Badge>
        </CardTitle>
        <CardDescription>AI-powered recommendations to improve your workflow</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleSuggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onDismiss={() => handleDismiss(suggestion.id)}
            onApply={() => handleApply(suggestion)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onDismiss: () => void;
  onApply: () => void;
}

function SuggestionCard({ suggestion, onDismiss, onApply }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getSuggestionIcon = () => {
    switch (suggestion.type) {
      case 'optimization':
        return <Zap className="h-5 w-5 text-yellow-500" />;
      case 'automation':
        return <TrendingUp className="h-5 w-5 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'opportunity':
        return <Lightbulb className="h-5 w-5 text-green-500" />;
    }
  };

  const getSuggestionTypeLabel = () => {
    switch (suggestion.type) {
      case 'optimization':
        return 'Optimization';
      case 'automation':
        return 'Automation';
      case 'warning':
        return 'Warning';
      case 'opportunity':
        return 'Opportunity';
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">{getSuggestionIcon()}</div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm break-words">{suggestion.title}</h4>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {getSuggestionTypeLabel()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground break-words">{suggestion.description}</p>

            {/* Confidence indicator */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground flex-shrink-0">Confidence:</span>
              <Progress
                value={suggestion.confidence * 100}
                className="h-1.5 flex-1 min-w-0 max-w-[100px]"
              />
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {Math.round(suggestion.confidence * 100)}%
              </span>
            </div>

            {/* Estimated impact */}
            {suggestion.estimatedImpact && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 break-words">
                💡 {suggestion.estimatedImpact}
              </p>
            )}

            {/* Expandable suggested actions */}
            {suggestion.suggestedActions && suggestion.suggestedActions.length > 0 && (
              <details className="mt-2">
                <summary
                  className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    setExpanded(!expanded);
                  }}
                >
                  {expanded ? 'Hide' : 'Show'} details
                </summary>
                {expanded && (
                  <ul className="mt-2 space-y-1">
                    {suggestion.suggestedActions.map((action, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary flex-shrink-0">•</span>
                        <span className="break-words">{action.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {suggestion.actionable && (
            <Button size="sm" variant="default" className="h-8 flex-shrink-0" onClick={onApply}>
              <Check className="h-4 w-4 mr-1" />
              Apply
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Usage example component showing how suggestions might look in action
export function EvolutionInsightsExample() {
  const [mockSuggestions] = useState<Suggestion[]>([
    {
      id: '1',
      type: 'automation',
      title: 'Automate Daily News Summary',
      description: 'You check news every morning. I can create an automated workflow for this.',
      priority: 0.9,
      actionable: true,
      confidence: 0.95,
      suggestedActions: [
        {
          type: 'workflow',
          description: 'Create workflow that fetches news at 8 AM',
          estimatedImpact: 'Save ~15 minutes daily',
        },
      ],
      estimatedImpact: 'Save ~15 minutes daily',
    },
    {
      id: '2',
      type: 'optimization',
      title: 'Optimize Data Processing Workflow',
      description: 'Your data workflow could be 40% faster by processing items in parallel.',
      priority: 0.8,
      actionable: true,
      confidence: 0.87,
      suggestedActions: [
        {
          type: 'workflow',
          description: 'Enable parallel processing for this workflow',
        },
      ],
      estimatedImpact: 'Reduce execution time by 40%',
    },
    {
      id: '3',
      type: 'opportunity',
      title: 'New Skill Available',
      description:
        'A new skill for GitHub integration was just released that matches your usage patterns.',
      priority: 0.6,
      actionable: true,
      confidence: 0.75,
      suggestedActions: [
        {
          type: 'automation',
          description: 'Install GitHub integration skill',
        },
      ],
    },
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Evolution Insights Preview</h3>
        <Badge
          variant="secondary"
          className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
        >
          Beta
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        These suggestions are based on your usage patterns and can help you work more efficiently.
      </p>
      <div className="space-y-3">
        {mockSuggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onDismiss={() => console.log('Dismiss:', suggestion.id)}
            onApply={() => console.log('Apply:', suggestion.id)}
          />
        ))}
      </div>
    </div>
  );
}
