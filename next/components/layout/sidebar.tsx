'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Workflow,
  Database,
  Code2,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Quick Chat', href: '/chat', icon: MessageSquare },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Channels', href: '/channels', icon: MessageCircle },
  { name: 'Browser', href: '/browser', icon: Globe },
  { name: 'Memory', href: '/memory', icon: Database },
  { name: 'Skills', href: '/skills', icon: Code2 },
  { name: 'Scheduled', href: '/scheduled', icon: Clock },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const {
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    setSidebarCollapsed,
  } = useAppStore();

  // Auto-expand sidebar when window is resized to large size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && sidebarCollapsed) {
        // Auto-expand on large screens
        setSidebarCollapsed(false);
      }
    };

    window.addEventListener('resize', handleResize);
    // Check on mount
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen border-r bg-background transition-all duration-200 ease-in-out',
          'lg:static',
          !sidebarOpen && '-translate-x-full',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
                <Image src="/icon.png" alt="DeskClaw" width={32} height={32} className="h-5 w-5" />
              </div>
              {!sidebarCollapsed && <span className="font-semibold">DeskClaw</span>}
            </div>
            <div className="flex items-center gap-1">
              {/* Collapse/Expand button - always visible on desktop */}
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex"
                onClick={toggleSidebarCollapsed}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
              {/* Mobile close button */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                  )}
                  onClick={() => {
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                    window.electronAPI?.evolution?.trackEvent?.('page_view', {
                      page: item.href,
                    });
                  }}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            {!sidebarCollapsed ? (
              <div className="text-xs text-muted-foreground">
                <p>DeskClaw v0.3.0</p>
                <p className="mt-1">Local-first AI Agent</p>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="h-1 w-8 rounded-full bg-muted" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
