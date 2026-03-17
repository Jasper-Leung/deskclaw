'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Info } from 'lucide-react';
import { useMemo, useEffect, useState, useCallback } from 'react';

interface Message {
  role: string;
  content: string;
  timestamp?: number;
}

interface ContextUsageBarProps {
  messages: Message[];
  maxTokens?: number;
  maxChars?: number;
  onTruncate?: () => void;
  showWarning?: boolean;
  modelId?: string; // Add modelId for accurate token counting
}

/**
 * Fallback token estimation (character-based)
 * Used when IPC is not available or fails
 */
function estimateTokensFallback(message: Message): number {
  if (!message.content || message.content.length === 0) {
    return 0;
  }

  // More accurate character-based estimation
  // Use a different approach to avoid control character in regex
  const nonAsciiCount = message.content.split('').filter((c) => c.charCodeAt(0) > 127).length;
  const nonAsciiRatio = nonAsciiCount / message.content.length;

  if (nonAsciiRatio > 0.5) {
    // Mostly CJK characters
    return Math.ceil(message.content.length / 2);
  } else if (message.content.includes('{') && message.content.includes('}')) {
    // Likely JSON or code
    return Math.ceil(message.content.length / 3);
  } else {
    // Standard English text
    return Math.ceil(message.content.length / 4);
  }
}

/**
 * Calculate total tokens/messages and provide usage statistics
 * Uses accurate token counting via IPC when available
 */
function calculateContextUsage(
  messages: Message[],
  maxTokens: number = 128000,
  maxChars: number = 100000,
  accurateTokenCount: number | null = null
) {
  const totalMessages = messages.length;
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);

  // Use accurate token count if provided, otherwise use fallback
  let totalTokens: number;
  if (accurateTokenCount !== null) {
    totalTokens = accurateTokenCount;
  } else {
    totalTokens = messages.reduce((sum, msg) => sum + estimateTokensFallback(msg), 0);
  }

  // Use token-based percentage (primary metric)
  // Char-based percentage is only for reference/warning
  const tokenPercentage = (totalTokens / maxTokens) * 100;
  const charPercentage = (totalChars / maxChars) * 100;
  const percentage = tokenPercentage; // Use only token percentage

  // Determine status color
  let status: 'safe' | 'warning' | 'danger' = 'safe';
  if (percentage >= 95) {
    status = 'danger';
  } else if (percentage >= 80) {
    status = 'warning';
  }

  // Estimate remaining capacity
  const remainingTokens = Math.max(0, maxTokens - totalTokens);
  const remainingChars = Math.max(0, maxChars - totalChars);
  const remainingMessages = Math.max(0, Math.floor(remainingTokens / 100)); // Rough estimate

  return {
    totalMessages,
    totalChars,
    totalTokens,
    percentage: Math.min(100, percentage),
    status,
    remainingTokens,
    remainingChars,
    remainingMessages,
    maxTokens,
    maxChars,
  };
}

export function ContextUsageBar({
  messages,
  maxTokens = 128000,
  maxChars = 100000,
  onTruncate,
  showWarning = true,
  modelId = 'gpt-4', // Default model for token counting
}: ContextUsageBarProps) {
  // State for accurate token count
  const [accurateTokenCount, setAccurateTokenCount] = useState<number | null>(null);
  const [_isTokenLoading, setIsTokenLoading] = useState(false);

  // Function to get accurate token count via IPC
  const getAccurateTokenCount = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.tokens) {
      return;
    }

    setIsTokenLoading(true);
    try {
      const result = await window.electronAPI.tokens.countMessages(messages, modelId);
      if (result.success) {
        setAccurateTokenCount(result.count);
      }
    } catch (error) {
      console.warn('Failed to get accurate token count:', error);
      // Will use fallback estimation
    } finally {
      setIsTokenLoading(false);
    }
  }, [messages, modelId]);

  // Update accurate token count when messages or modelId changes
  useEffect(() => {
    // Debounce token counting to avoid excessive IPC calls
    const timeoutId = setTimeout(() => {
      getAccurateTokenCount();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [getAccurateTokenCount]);

  const usage = useMemo(
    () => calculateContextUsage(messages, maxTokens, maxChars, accurateTokenCount),
    [messages, maxTokens, maxChars, accurateTokenCount]
  );

  // Warning message based on status
  const warningMessage = useMemo(() => {
    switch (usage.status) {
      case 'danger':
        return `Context almost full (${usage.percentage.toFixed(0)}%). Truncate messages or the conversation may fail.`;
      case 'warning':
        return `Context usage high (${usage.percentage.toFixed(0)}%). Consider truncating older messages.`;
      default:
        return null;
    }
  }, [usage.percentage, usage.status]);

  // Format large numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="space-y-2">
      {/* Warning Alert */}
      {showWarning && warningMessage && (
        <Alert
          variant="destructive"
          className={`py-2 ${
            usage.status === 'warning'
              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300'
              : ''
          }`}
        >
          {usage.status === 'danger' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Info className="h-4 w-4" />
          )}
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm">{warningMessage}</span>
            {onTruncate && (
              <button
                onClick={onTruncate}
                className="ml-2 px-2 py-1 text-xs font-medium rounded bg-current bg-opacity-20 hover:bg-opacity-30 transition-colors"
              >
                Truncate
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Bar with Stats */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="space-y-1 cursor-help">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">Context Usage</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <p>
                          <strong>Max Limits:</strong>
                        </p>
                        <p>• {formatNumber(usage.maxTokens)} tokens</p>
                        <p>• {formatNumber(usage.maxChars)} characters</p>
                        <p className="mt-2 text-muted-foreground">
                          Token estimates are approximate (~4 chars/token).
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger>
                      <span
                        className={usage.status === 'danger' ? 'text-red-600 font-semibold' : ''}
                      >
                        {usage.percentage.toFixed(0)}%
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <div className="space-y-1 text-xs">
                        <p>
                          <strong>Current Usage:</strong>
                        </p>
                        <p>• {formatNumber(usage.totalTokens)} tokens</p>
                        <p>• {formatNumber(usage.totalChars)} characters</p>
                        <p>• {usage.totalMessages} messages</p>
                        <p className="mt-2">
                          <strong>Remaining:</strong>
                        </p>
                        <p>• ~{formatNumber(usage.remainingTokens)} tokens</p>
                        <p>• ~{usage.remainingMessages} messages (est.)</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative">
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 ease-in-out"
                    style={{
                      width: `${usage.percentage}%`,
                      backgroundColor:
                        usage.status === 'danger'
                          ? 'rgb(239 68 68)'
                          : usage.status === 'warning'
                            ? 'rgb(234 179 8)'
                            : 'rgb(34 197 94)',
                    }}
                  />
                </div>
              </div>

              {/* Detailed Stats (collapsed) */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{usage.totalMessages} msgs</span>
                <span>{formatNumber(usage.totalTokens)} tokens</span>
                <span>{formatNumber(usage.totalChars)} chars</span>
                <span className="text-green-600 dark:text-green-400">
                  ~{formatNumber(usage.remainingTokens)} left
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-sm">
            <div className="space-y-2 text-xs">
              <p className="font-medium">Context Usage Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Messages:</span>
                <span>{usage.totalMessages}</span>

                <span className="text-muted-foreground">Tokens:</span>
                <span>
                  {formatNumber(usage.totalTokens)} / {formatNumber(usage.maxTokens)}
                </span>

                <span className="text-muted-foreground">Characters:</span>
                <span>
                  {formatNumber(usage.totalChars)} / {formatNumber(usage.maxChars)}
                </span>

                <span className="text-muted-foreground">Used:</span>
                <span className={usage.status === 'danger' ? 'text-red-600 font-semibold' : ''}>
                  {usage.percentage.toFixed(1)}%
                </span>

                <span className="text-muted-foreground">Remaining:</span>
                <span>~{formatNumber(usage.remainingTokens)} tokens</span>
              </div>
              <p className="text-muted-foreground mt-2">
                Token estimates are approximate. Actual usage may vary by model.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/**
 * Hook to use context usage calculations
 */
export function useContextUsage(
  messages: Message[],
  maxTokens: number = 128000,
  maxChars: number = 100000
) {
  return useMemo(
    () => calculateContextUsage(messages, maxTokens, maxChars),
    [messages, maxTokens, maxChars]
  );
}
