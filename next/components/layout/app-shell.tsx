'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { useAppStore } from '@/lib/store';
import { ApprovalGate } from '@/components/approval/approval-gate';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { theme } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Listen for navigation events from main process
  useEffect(() => {
    const handleNavigate = (route: string) => {
      router.push(route);
    };

    // electronAPI is injected by preload script
    if (window.electronAPI) {
      window.electronAPI.onNavigate?.(handleNavigate);
    }
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <ApprovalGate />
    </div>
  );
}
