'use client';

import { useEffect, useState, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, Terminal, Brain, Route } from 'lucide-react';

export interface LogEntry {
  id: string;
  type: 'llm' | 'shell' | 'routing' | 'system';
  message: string;
  timestamp: number;
  details?: string;
}

export function ExecutionConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.electronAPI) {
      const unsubChunk = window.electronAPI.llm.onStreamChunk?.(
        (chunk: { content: string; done: boolean }) => {
          if (!chunk.done && chunk.content) {
            addLog('llm', chunk.content);
          }
        }
      );

      const unsubShell = window.electronAPI.shell?.onOutput?.(
        (output: { type: 'stdout' | 'stderr'; content: string }) => {
          addLog('shell', output.content);
        }
      );

      return () => {
        unsubChunk?.();
        unsubShell?.();
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (type: LogEntry['type'], message: string, details?: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        message,
        timestamp: Date.now(),
        details,
      },
    ]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'llm':
        return <Brain className="h-3 w-3 text-blue-500" />;
      case 'shell':
        return <Terminal className="h-3 w-3 text-green-500" />;
      case 'routing':
        return <Route className="h-3 w-3 text-purple-500" />;
      default:
        return null;
    }
  };

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'llm':
        return 'text-blue-600 dark:text-blue-400';
      case 'shell':
        return 'text-green-600 dark:text-green-400';
      case 'routing':
        return 'text-purple-600 dark:text-purple-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <h3 className="text-sm font-medium">Execution Console</h3>
        <Button variant="ghost" size="sm" onClick={clearLogs}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-2 space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-muted-foreground text-center py-4">
              No logs yet. Activity will appear here.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`flex items-start gap-2 p-1 rounded hover:bg-muted/50 ${getLogColor(log.type)}`}
              >
                <span className="text-muted-foreground shrink-0">
                  [{formatTimestamp(log.timestamp)}]
                </span>
                <span className="shrink-0 mt-0.5">{getLogIcon(log.type)}</span>
                <span className="break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
