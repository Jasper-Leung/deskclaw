'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Terminal, Check, X } from 'lucide-react';

interface ApprovalRequest {
  approvalId: string;
  command: string;
  isDangerous: boolean;
}

export function ApprovalGate() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      const unsub = window.electronAPI.shell.onApprovalRequest((req: ApprovalRequest) => {
        setRequest(req);
      });
      return unsub;
    }
    return undefined;
  }, []);

  const handleApprove = async () => {
    if (!request) return;

    if (window.electronAPI) {
      await window.electronAPI.shell.approve(request.approvalId);
      setRequest(null);
    }
  };

  const handleReject = async () => {
    if (!request) return;

    if (window.electronAPI) {
      await window.electronAPI.shell.reject(request.approvalId);
      setRequest(null);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && handleReject()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {request?.isDangerous ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <Terminal className="h-5 w-5 text-yellow-500" />
            )}
            <DialogTitle>
              {request?.isDangerous ? 'Dangerous Command Detected' : 'Command Approval Required'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {request?.isDangerous
              ? 'This command has been flagged as potentially dangerous. Please review carefully before approving.'
              : 'A command requires your approval before execution.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="rounded-lg border bg-muted p-4">
            <p className="text-sm font-medium mb-2">Command:</p>
            <code className="text-sm font-mono break-all whitespace-pre-wrap block overflow-x-auto">
              {request?.command}
            </code>
          </div>

          {request?.isDangerous && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Warning:</strong> This command may cause irreversible changes to your
                system. Only approve if you trust the source and understand the consequences.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReject}>
            <X className="h-4 w-4 mr-2" />
            Reject
          </Button>
          <Button
            onClick={handleApprove}
            variant={request?.isDangerous ? 'destructive' : 'default'}
          >
            <Check className="h-4 w-4 mr-2" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
