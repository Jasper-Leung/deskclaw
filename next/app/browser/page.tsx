'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe,
  Play,
  Square,
  Camera,
  Eye,
  Navigation,
  Plus,
  Trash2,
  MousePointer,
  Type,
  Image as ImageIcon,
  Link,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('browser-page');

interface BrowserProfile {
  id: string;
  name: string;
  user_data_dir?: string;
  headless: number;
  viewport_width: number;
  viewport_height: number;
  cdp_endpoint?: string; // CDP endpoint for connecting to existing browser
  created_at: number;
  updated_at: number;
}

interface BrowserSession {
  id: string;
  profile_id: string;
  page_id: string;
  url?: string;
  title?: string;
  created_at: number;
  updated_at: number;
}

export default function BrowserPage() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [selector, setSelector] = useState('');
  const [typeText, setTypeText] = useState('');
  const [activeTab, setActiveTab] = useState<'control' | 'snapshot' | 'screenshot'>('control');

  // MCP Browser state
  const [mcpConnected, setMcpConnected] = useState(false);
  const [mcpSessions, setMcpSessions] = useState<any[]>([]);
  const [selectedMcpSession, setSelectedMcpSession] = useState<string | null>(null);

  // New state for browser profile creation
  const [browserType, setBrowserType] = useState<'new' | 'existing'>('new');

  // Extension Bridge state
  const [extensionBridgeRunning, setExtensionBridgeRunning] = useState(false);
  const [extensionCount, setExtensionCount] = useState(0);

  useEffect(() => {
    loadProfiles();
    loadSessions();
    loadMcpStatus();
  }, []);

  // Load MCP browser status
  const loadMcpStatus = async () => {
    try {
      if (window.electronAPI && window.electronAPI.mcpBrowser) {
        const statusResult = await window.electronAPI.mcpBrowser.isConnected();
        setMcpConnected(statusResult.connected);
        if (statusResult.connected) {
          await loadMcpSessions();
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load MCP status');
    }
  };

  // Load MCP sessions
  const loadMcpSessions = async () => {
    try {
      if (window.electronAPI && window.electronAPI.mcpBrowser) {
        const result = await window.electronAPI.mcpBrowser.sessions.list();
        if (result.success && result.sessions) {
          setMcpSessions(result.sessions);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load MCP sessions');
    }
  };

  const loadProfiles = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.browser.profiles.list();
        setProfiles(data);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load profiles');
    }
  };

  const loadSessions = async () => {
    try {
      if (window.electronAPI) {
        const data = (await window.electronAPI.browser.sessions?.list()) || [];
        setSessions(data);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load sessions');
    }
  };

  const handleLaunch = async (profileId: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.browser.launch(profileId);
        if (result.success) {
          await loadSessions();
        } else {
          alert(result.error || 'Failed to launch browser');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to launch browser');
    }
  };

  const handleCloseProfile = async (profileId: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.browser.closeProfile(profileId);
        await loadSessions();
      }
    } catch (error) {
      logger.error({ error }, 'Failed to close browser');
    }
  };

  const handleNavigate = async () => {
    if (!url) return;

    try {
      if (window.electronAPI) {
        let result;

        // Check if MCP browser is connected and has a selected session
        if (mcpConnected && selectedMcpSession) {
          // Use MCP browser API
          result = await window.electronAPI.mcpBrowser.navigate(url, selectedMcpSession);
          if (result.success) {
            refreshSnapshot();
            await loadMcpSessions();
          } else {
            alert(result.error || 'Failed to navigate');
            return;
          }
        } else if (selectedSession) {
          // Use regular browser API
          result = await window.electronAPI.browser.navigate(selectedSession, url);
          if (result.success) {
            refreshSnapshot();
            await loadSessions();
          } else {
            alert(result.error || 'Failed to navigate');
            return;
          }
        } else {
          alert('Please select a session first');
          return;
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to navigate');
      alert(`Failed to navigate: ${error}`);
    }
  };

  const refreshSnapshot = async () => {
    try {
      if (window.electronAPI) {
        if (mcpConnected && selectedMcpSession) {
          // Use MCP browser API
          const result = await window.electronAPI.mcpBrowser.snapshot(selectedMcpSession);
          if (result.success) {
            setSnapshot(result.snapshot);
          }
        } else if (selectedSession) {
          // Use regular browser API
          const result = await window.electronAPI.browser.snapshot(selectedSession, 'ai');
          if (result.success) {
            setSnapshot(result.snapshot);
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get snapshot');
    }
  };

  const handleScreenshot = async () => {
    try {
      if (window.electronAPI) {
        let result;
        if (mcpConnected && selectedMcpSession) {
          // Use MCP browser API
          result = await window.electronAPI.mcpBrowser.screenshot(selectedMcpSession);
        } else if (selectedSession) {
          // Use regular browser API
          result = await window.electronAPI.browser.screenshot(selectedSession, true);
        } else {
          return;
        }

        if (result.success) {
          setScreenshot(`data:${result.mimeType};base64,${result.data}`);
        } else {
          alert(result.error || 'Failed to take screenshot');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to take screenshot');
    }
  };

  const handleClick = async () => {
    if (!selector) return;

    try {
      if (window.electronAPI) {
        let result;
        if (mcpConnected && selectedMcpSession) {
          // Use MCP browser API
          result = await window.electronAPI.mcpBrowser.click(selector, selectedMcpSession);
        } else if (selectedSession) {
          // Use regular browser API
          result = await window.electronAPI.browser.click(selectedSession, selector);
        } else {
          alert('Please select a session first');
          return;
        }

        if (!result.success) {
          alert(result.error || 'Failed to click element');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to click');
    }
  };

  const handleType = async () => {
    if (!selector || !typeText) return;

    try {
      if (window.electronAPI) {
        let result;
        if (mcpConnected && selectedMcpSession) {
          // Use MCP browser API
          result = await window.electronAPI.mcpBrowser.type(selector, typeText, selectedMcpSession);
        } else if (selectedSession) {
          // Use regular browser API
          result = await window.electronAPI.browser.type(selectedSession, selector, typeText);
        } else {
          alert('Please select a session first');
          return;
        }

        if (!result.success) {
          alert(result.error || 'Failed to type text');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to type');
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this browser profile?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.browser.profiles.delete(id);
        await loadProfiles();
        await loadSessions();
      }
    } catch (error) {
      logger.error({ error }, 'Failed to delete profile');
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.browser.closeSession(sessionId);
        await loadSessions();
        if (selectedSession === sessionId) {
          setSelectedSession(null);
          setSnapshot(null);
          setScreenshot(null);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to close session');
    }
  };

  const handleCloseMcpSession = async (sessionId: string) => {
    try {
      if (window.electronAPI && window.electronAPI.mcpBrowser) {
        await window.electronAPI.mcpBrowser.closeSession(sessionId);
        await loadMcpSessions();
        if (selectedMcpSession === sessionId) {
          setSelectedMcpSession(null);
          setSnapshot(null);
          setScreenshot(null);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to close MCP session');
    }
  };

  // Extension Bridge control functions
  const checkExtensionBridgeStatus = async () => {
    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        const status = await window.electronAPI.extensionBridge.status();
        setExtensionBridgeRunning(status.running);
        setExtensionCount(status.extensions || 0);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check extension bridge status');
    }
  };

  const handleStartExtensionBridge = async () => {
    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        const result = await window.electronAPI.extensionBridge.start(9527);
        if (result.success) {
          setExtensionBridgeRunning(true);
          // Poll for connection status
          const interval = setInterval(() => checkExtensionBridgeStatus(), 2000);
          // Store interval ID for cleanup (in production)
          (window as any).extensionBridgeInterval = interval;
        } else {
          alert(result.error || 'Failed to start extension bridge');
        }
      } else {
        alert('Extension Bridge API not available. Please check if you are running in Electron.');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to start extension bridge');
    }
  };

  const handleStopExtensionBridge = async () => {
    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        const result = await window.electronAPI.extensionBridge.stop();
        if (result.success) {
          setExtensionBridgeRunning(false);
          setExtensionCount(0);
          // Clear polling interval
          if ((window as any).extensionBridgeInterval) {
            clearInterval((window as any).extensionBridgeInterval);
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to stop extension bridge');
    }
  };

  // Extension control functions
  const handleExtensionNavigate = async () => {
    if (!url) return;

    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        await window.electronAPI.extensionBridge.navigate(url);
        alert('Navigation command sent to browser extension');
      } else {
        alert('Extension Bridge not available');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to navigate');
    }
  };

  const handleExtensionSnapshot = async () => {
    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        await window.electronAPI.extensionBridge.snapshot();
        alert('Snapshot command sent - check extension for results');
      } else {
        alert('Extension Bridge not available');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get snapshot');
    }
  };

  const handleExtensionClick = async () => {
    if (!selector) return;

    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        await window.electronAPI.extensionBridge.click(selector);
        alert('Click command sent to browser extension');
      } else {
        alert('Extension Bridge not available');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to click');
    }
  };

  const handleExtensionType = async () => {
    if (!selector || !typeText) return;

    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        await window.electronAPI.extensionBridge.type(selector, typeText);
        alert('Type command sent to browser extension');
      } else {
        alert('Extension Bridge not available');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to type');
    }
  };

  const handleExtensionScreenshot = async () => {
    try {
      if (window.electronAPI && window.electronAPI.extensionBridge) {
        const result = await window.electronAPI.extensionBridge.screenshot();
        if (result.success && result.data?.screenshot) {
          // Show screenshot in a new window or display it
          const win = window.open();
          if (win) {
            win.document.write(`<img src="${result.data.screenshot}" />`);
            win.document.close();
          }
        }
      } else {
        alert('Extension Bridge not available');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to take screenshot');
    }
  };

  // Load extension bridge status on mount
  useEffect(() => {
    checkExtensionBridgeStatus();
    const interval = setInterval(checkExtensionBridgeStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeProfileIds = new Set(sessions.map((s) => s.profile_id));

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Browser Control</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automate web browsing with Playwright
            </p>
          </div>
          <Button
            onClick={() => {
              setBrowserType('new');
              setShowAddProfile(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Profile
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Profiles Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Browser Profiles</h2>
              <Badge variant="outline">{profiles.length}</Badge>
            </div>

            {profiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No browser profiles
              </div>
            ) : (
              <div className="space-y-2">
                {profiles.map((profile) => {
                  const isActive = activeProfileIds.has(profile.id);
                  return (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-1">
                          {profile.name}
                          {profile.cdp_endpoint && (
                            <Badge variant="secondary" className="text-xs">
                              <Link className="h-3 w-3 mr-1" />
                              Connected
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {profile.viewport_width}x{profile.viewport_height}
                          {profile.headless ? ' • Headless' : ' • Visible'}
                          {profile.cdp_endpoint && ` • ${profile.cdp_endpoint}`}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCloseProfile(profile.id)}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLaunch(profile.id)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProfile(profile.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Active Sessions */}
            {sessions.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <h3 className="font-semibold text-sm">Playwright Sessions</h3>
                {sessions.map((session) => {
                  const profile = profiles.find((p) => p.id === session.profile_id);
                  return (
                    <div
                      key={session.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedSession === session.id
                          ? 'bg-accent border-accent-foreground'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        setSelectedSession(session.id);
                        setSelectedMcpSession(null); // Clear MCP session when selecting Playwright session
                        // Only set URL if the input field is empty or the current URL matches this session's URL
                        // This prevents overwriting user's input when switching sessions
                        if (!url || url === session.url) {
                          if (session.url) setUrl(session.url);
                        }
                        refreshSnapshot();
                      }}
                    >
                      <div className="font-medium text-sm truncate">
                        {profile?.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {session.title || session.url || 'No page loaded'}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-6 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseSession(session.id);
                        }}
                      >
                        Close
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MCP Browser Sessions */}
            {mcpConnected && mcpSessions.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    Chrome Sessions (MCP)
                    <Badge variant="default" className="text-xs">
                      Connected
                    </Badge>
                  </h3>
                </div>
                {mcpSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedMcpSession === session.id
                        ? 'bg-accent border-accent-foreground'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      setSelectedMcpSession(session.id);
                      setSelectedSession(null); // Clear Playwright session when selecting MCP session
                      // Only set URL if the input field is empty or the current URL matches this session's URL
                      if (!url || url === session.url) {
                        if (session.url) setUrl(session.url);
                      }
                      refreshSnapshot();
                    }}
                  >
                    <div className="font-medium text-sm truncate">
                      {session.title || 'Chrome Tab'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {session.url || 'No URL'}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseMcpSession(session.id);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Control Panel */}
          <div className="lg:col-span-2 space-y-4">
            {selectedSession || selectedMcpSession ? (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="control">
                    <Navigation className="h-4 w-4 mr-2" />
                    Control
                  </TabsTrigger>
                  <TabsTrigger value="snapshot">
                    <Eye className="h-4 w-4 mr-2" />
                    Snapshot
                  </TabsTrigger>
                  <TabsTrigger value="screenshot">
                    <Camera className="h-4 w-4 mr-2" />
                    Screenshot
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="control" className="space-y-4">
                  {/* Navigate */}
                  <div className="space-y-2">
                    <Label>Navigate to URL</Label>
                    <div className="flex gap-2">
                      <Input
                        key={`url-input-${selectedSession || selectedMcpSession || 'none'}`}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com"
                        onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
                      />
                      <Button onClick={handleNavigate}>
                        <Navigation className="h-4 w-4 mr-2" />
                        Go
                      </Button>
                    </div>
                  </div>

                  {/* Click Element */}
                  <div className="space-y-2">
                    <Label>Click Element</Label>
                    <div className="flex gap-2">
                      <Input
                        key={`selector-input-${selectedSession || selectedMcpSession || 'none'}`}
                        value={selector}
                        onChange={(e) => setSelector(e.target.value)}
                        placeholder="CSS selector, e.g., button.submit"
                      />
                      <Button onClick={handleClick}>
                        <MousePointer className="h-4 w-4 mr-2" />
                        Click
                      </Button>
                    </div>
                  </div>

                  {/* Type Text */}
                  <div className="space-y-2">
                    <Label>Type Text</Label>
                    <div className="flex gap-2">
                      <Input
                        key={`type-selector-input-${selectedSession || selectedMcpSession || 'none'}`}
                        value={selector}
                        onChange={(e) => setSelector(e.target.value)}
                        placeholder="CSS selector"
                        className="flex-1"
                      />
                      <Input
                        key={`type-text-input-${selectedSession || selectedMcpSession || 'none'}`}
                        value={typeText}
                        onChange={(e) => setTypeText(e.target.value)}
                        placeholder="Text to type"
                        className="flex-1"
                      />
                      <Button onClick={handleType}>
                        <Type className="h-4 w-4 mr-2" />
                        Type
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="snapshot" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Page Snapshot (AI-readable)</Label>
                    <Button variant="outline" size="sm" onClick={refreshSnapshot}>
                      <Eye className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>

                  {snapshot ? (
                    <div className="p-4 bg-muted rounded-lg overflow-auto max-h-[500px]">
                      <pre className="text-xs">{JSON.stringify(snapshot, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      No snapshot data. Click refresh to get the current page state.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="screenshot" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Page Screenshot</Label>
                    <Button variant="outline" size="sm" onClick={handleScreenshot}>
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                  </div>

                  {screenshot ? (
                    <div className="border rounded-lg overflow-hidden">
                      <img src={screenshot} alt="Page screenshot" className="w-full" />
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      No screenshot. Click capture to take a screenshot of the current page.
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Globe className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="font-semibold mb-2">No browser session selected</h3>
                <p className="text-sm">
                  {mcpConnected
                    ? 'Select a Chrome session from the list to control it'
                    : 'Launch a browser profile or connect to Chrome (MCP) to get started'}
                </p>
                {!mcpConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={async () => {
                      try {
                        if (window.electronAPI && window.electronAPI.mcpBrowser) {
                          const result = await window.electronAPI.mcpBrowser.connect();
                          if (result.success) {
                            await loadMcpStatus();
                          } else {
                            alert(result.error || 'Failed to connect to Chrome');
                          }
                        }
                      } catch (error) {
                        logger.error({ error }, 'Failed to connect to MCP');
                        alert(`Failed to connect: ${error}`);
                      }
                    }}
                  >
                    <Link className="h-4 w-4 mr-2" />
                    Connect to Chrome (MCP)
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Extension Bridge Panel */}
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Extension Bridge</h2>
              <Badge variant={extensionBridgeRunning ? 'default' : 'secondary'}>
                {extensionBridgeRunning ? 'Running' : 'Stopped'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {extensionBridgeRunning && (
                <Badge variant="outline">{extensionCount} connected</Badge>
              )}
              {extensionBridgeRunning ? (
                <Button variant="outline" size="sm" onClick={handleStopExtensionBridge}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleStartExtensionBridge}>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              )}
            </div>
          </div>

          {extensionBridgeRunning && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Navigate */}
              <div className="space-y-2">
                <Label>Navigate (Extension)</Label>
                <div className="flex gap-2">
                  <Input
                    key={`ext-url-input-${selectedSession}`}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    onKeyDown={(e) => e.key === 'Enter' && handleExtensionNavigate()}
                  />
                  <Button variant="outline" size="sm" onClick={handleExtensionNavigate}>
                    <Navigation className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Click */}
              <div className="space-y-2">
                <Label>Click (Extension)</Label>
                <div className="flex gap-2">
                  <Input
                    key={`ext-selector-input-${selectedSession}`}
                    value={selector}
                    onChange={(e) => setSelector(e.target.value)}
                    placeholder="CSS selector"
                  />
                  <Button variant="outline" size="sm" onClick={handleExtensionClick}>
                    <MousePointer className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label>Type (Extension)</Label>
                <div className="flex gap-2">
                  <Input
                    key={`ext-type-text-input-${selectedSession}`}
                    value={typeText}
                    onChange={(e) => setTypeText(e.target.value)}
                    placeholder="Text to type"
                  />
                  <Button variant="outline" size="sm" onClick={handleExtensionType}>
                    <Type className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Snapshot */}
              <Button
                variant="outline"
                onClick={handleExtensionSnapshot}
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4 mr-2" />
                Get Snapshot
              </Button>

              {/* Screenshot */}
              <Button
                variant="outline"
                onClick={handleExtensionScreenshot}
                className="flex items-center gap-2"
              >
                <Camera className="h-4 w-4 mr-2" />
                Take Screenshot
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <strong>Extension Bridge</strong> allows sending commands through browser extensions
            connected via WebSocket (port 9527). Install the DeskClaw browser extension to enable
            this feature.
          </div>
        </div>

        {/* Add Profile Dialog */}
        <Dialog
          open={showAddProfile}
          onOpenChange={(open) => {
            setShowAddProfile(open);
            if (!open) {
              setBrowserType('new');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Browser Profile</DialogTitle>
              <DialogDescription>Configure a new browser profile for automation</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const cdpEndpoint =
                  browserType === 'existing' ? (formData.get('cdpEndpoint') as string) : undefined;

                try {
                  if (window.electronAPI) {
                    await window.electronAPI.browser.profiles.create({
                      name: formData.get('name') as string,
                      headless: browserType === 'new' ? formData.get('headless') === 'true' : false,
                      viewportWidth: parseInt(formData.get('viewportWidth') as string) || 1280,
                      viewportHeight: parseInt(formData.get('viewportHeight') as string) || 720,
                      cdpEndpoint,
                    });
                    await loadProfiles();
                    setShowAddProfile(false);
                    setBrowserType('new');
                  }
                } catch (error) {
                  logger.error({ error }, 'Failed to create profile');
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Profile Name</Label>
                <Input id="name" name="name" placeholder="My Browser" required />
              </div>

              <div className="space-y-2">
                <Label>Browser Type</Label>
                <Select
                  value={browserType}
                  onValueChange={(value) => setBrowserType(value as 'new' | 'existing')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select browser type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Launch New Browser (Playwright)</SelectItem>
                    <SelectItem value="existing">Connect to Existing Browser (CDP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {browserType === 'new' && (
                <div className="space-y-2">
                  <Label htmlFor="headless">Display Mode</Label>
                  <Select name="headless" defaultValue="true">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Headless (no UI)</SelectItem>
                      <SelectItem value="false">Visible (with UI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {browserType === 'existing' && (
                <div className="space-y-2">
                  <Label htmlFor="cdpEndpoint" className="flex items-center gap-1">
                    CDP Endpoint
                    <span className="text-xs text-muted-foreground font-normal">
                      (e.g., http://localhost:9222)
                    </span>
                  </Label>
                  <Input id="cdpEndpoint" name="cdpEndpoint" placeholder="http://localhost:9222" />
                  <p className="text-xs text-muted-foreground">
                    Start your browser with remote debugging: <br />
                    <code>chrome.exe --remote-debugging-port=9222</code>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4" id="viewportFields">
                <div className="space-y-2">
                  <Label htmlFor="viewportWidth">Viewport Width</Label>
                  <Input
                    id="viewportWidth"
                    name="viewportWidth"
                    type="number"
                    defaultValue={1280}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="viewportHeight">Viewport Height</Label>
                  <Input
                    id="viewportHeight"
                    name="viewportHeight"
                    type="number"
                    defaultValue={720}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddProfile(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Profile</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
