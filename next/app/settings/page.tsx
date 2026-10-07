'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2, Check, X, Edit, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Provider, Model } from '@shared/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('settings-page');

interface ModelWithProvider extends Model {
  providerName?: string;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelWithProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [defaultModel, setDefaultModel] = useState<string>('');
  const [skipSecurityPrompts, setSkipSecurityPrompts] = useState(false);

  // API Server state
  const [apiServerEnabled, setApiServerEnabled] = useState(false);
  const [apiServerPort, setApiServerPort] = useState(18790);
  const [apiServerAuthToken, setApiServerAuthToken] = useState('');

  // Smart Routing state
  const [smartRoutingEnabled, setSmartRoutingEnabled] = useState(false);
  const [smartRoutingCheapModel, setSmartRoutingCheapModel] = useState('');
  const [smartRoutingCharThreshold, setSmartRoutingCharThreshold] = useState(160);
  const [smartRoutingWordThreshold, setSmartRoutingWordThreshold] = useState(28);

  // Credential Pool state
  const [selectedProviderForKeys, setSelectedProviderForKeys] = useState<string | null>(null);
  const [providerKeys, setProviderKeys] = useState<any[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [providersData, modelsData, settingsData] = await Promise.all([
          window.electronAPI.providers.list(),

          window.electronAPI.models.list(),

          window.electronAPI.settings.getAll(),
        ]);
        setProviders(providersData);
        setModels(modelsData);

        const savedDefault = localStorage.getItem('deskclaw-default-model');
        if (savedDefault && modelsData.some((m: Model) => m.id === savedDefault)) {
          setDefaultModel(savedDefault);
        } else if (modelsData.length > 0) {
          setDefaultModel(modelsData[0].id);
        }

        if (settingsData) {
          const skipSecurity = settingsData['skipSecurityPrompts'];
          setSkipSecurityPrompts(skipSecurity === 'true' || skipSecurity === '1');
        }

        // Load API server config
        try {
          const apiStatus = await window.electronAPI.apiServer.status();
          if (apiStatus?.config) {
            setApiServerEnabled(apiStatus.config.enabled);
            setApiServerPort(apiStatus.config.port || 18790);
            setApiServerAuthToken(apiStatus.config.authToken || '');
          }
        } catch {
          // API server not available yet
        }

        // Load Smart Routing config
        try {
          const routingConfig = await window.electronAPI.smartRouting.getConfig();
          if (routingConfig) {
            setSmartRoutingEnabled(routingConfig.enabled);
            setSmartRoutingCheapModel(routingConfig.cheapModelId || '');
            setSmartRoutingCharThreshold(routingConfig.charThreshold || 160);
            setSmartRoutingWordThreshold(routingConfig.wordThreshold || 28);
          }
        } catch {
          // Smart routing not available yet
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load data');
    }
  };

  const handleTestProvider = async (id: string) => {
    setTestingProvider(id);
    setTestResult(null);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.providers.test(id);
        setTestResult({ success: true, message: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleTestModelOnly = async () => {
    const form = document.getElementById('addModelForm') as HTMLFormElement;
    if (!form) return;

    const formData = new FormData(form);
    const providerId = formData.get('providerId') as string;
    const modelId = formData.get('modelId') as string;

    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      setTestResult({ success: false, message: 'Please select a provider' });
      return;
    }

    setTestingModel(true);
    setTestResult(null);

    try {
      if (window.electronAPI) {
        await window.electronAPI.providers.testModel({
          protocol: provider.protocol,
          baseUrl: provider.baseUrl,
          apiKey: (formData.get('apiKey') as string) || '',
          modelId: modelId,
        });

        setTestResult({
          success: true,
          message: 'Connection test passed! Model ID is valid and accessible.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    } finally {
      setTestingModel(false);
    }
  };

  const handleSaveModelOnly = async () => {
    const form = document.getElementById('addModelForm') as HTMLFormElement;
    if (!form) return;

    const formData = new FormData(form);
    const providerId = formData.get('providerId') as string;
    const modelId = formData.get('modelId') as string;

    if (!modelId.trim()) {
      setTestResult({ success: false, message: 'Please enter a Model ID' });
      return;
    }

    try {
      if (window.electronAPI) {
        await window.electronAPI.models.create({
          providerId: providerId,
          modelId: modelId,
          displayName: formData.get('displayName') || undefined,
          isCustom: true,
        });

        await loadData();
        setShowAddModel(false);
        setTestResult({ success: true, message: 'Model saved successfully!' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    }
  };

  const handleAddProvider = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.providers.create({
          name: formData.get('name'),
          protocol: formData.get('protocol'),
          baseUrl: formData.get('baseUrl'),
          apiKey: formData.get('apiKey'),
        });
        await loadData();
        setShowAddProvider(false);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to add provider');
      alert('Failed to add provider. Please try again.');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this provider? All associated models will also be deleted.'
      )
    )
      return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.providers.delete(id);
        await loadData();
      }
    } catch (error) {
      logger.error({ error }, 'Failed to delete provider');
    }
  };

  const handleUpdateProvider = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProvider) return;

    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.providers.update(editingProvider.id, {
          name: formData.get('name'),
          baseUrl: formData.get('baseUrl'),
          apiKey: formData.get('apiKey'),
        });
        await loadData();
        setEditingProvider(null);
        setTestResult({ success: true, message: 'Provider updated successfully!' });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update provider');
      alert('Failed to update provider. Please try again.');
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this model?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.models.delete(id);
        await loadData();
      }
    } catch (error) {
      logger.error({ error }, 'Failed to delete model');
    }
  };

  const handleSetDefaultModel = (modelId: string) => {
    setDefaultModel(modelId);
    localStorage.setItem('deskclaw-default-model', modelId);
  };

  const handleToggleSkipSecurity = async (value: boolean) => {
    setSkipSecurityPrompts(value);
    try {
      if (window.electronAPI) {
        await window.electronAPI.settings.set('skipSecurityPrompts', value.toString());
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save setting');
    }
  };

  const handleResetAddModel = () => {
    setShowAddModel(false);
    setTestResult(null);
  };

  const handleToggleApiServer = async (enabled: boolean) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.apiServer.updateConfig({ enabled });
        setApiServerEnabled(enabled);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to toggle API server');
    }
  };

  const handleSaveApiServerConfig = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.apiServer.updateConfig({
          port: apiServerPort,
          authToken: apiServerAuthToken || undefined,
          enabled: apiServerEnabled,
        });
        setTestResult({ success: true, message: 'API Server configuration saved!' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    }
  };

  const handleSaveSmartRoutingConfig = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.smartRouting.updateConfig({
          enabled: smartRoutingEnabled,
          cheapModelId: smartRoutingCheapModel,
          charThreshold: smartRoutingCharThreshold,
          wordThreshold: smartRoutingWordThreshold,
        });
        setTestResult({ success: true, message: 'Smart Routing configuration saved!' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    }
  };

  const loadProviderKeys = async (providerId: string) => {
    try {
      if (window.electronAPI) {
        const keys = await window.electronAPI.credentials.list(providerId);
        setProviderKeys(keys || []);
        setSelectedProviderForKeys(providerId);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load provider keys');
    }
  };

  const handleAddCredential = async () => {
    if (!selectedProviderForKeys || !newKeyValue.trim()) return;
    try {
      if (window.electronAPI) {
        await window.electronAPI.credentials.add({
          providerId: selectedProviderForKeys,
          label: newKeyLabel || `Key ${(providerKeys?.length || 0) + 1}`,
          apiKey: newKeyValue.trim(),
        });
        setNewKeyLabel('');
        setNewKeyValue('');
        await loadProviderKeys(selectedProviderForKeys);
        setTestResult({ success: true, message: 'API key added to pool!' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
    }
  };

  const handleRemoveCredential = async (id: string) => {
    if (!confirm('Remove this API key from the pool?')) return;
    try {
      if (window.electronAPI && selectedProviderForKeys) {
        await window.electronAPI.credentials.remove(id);
        await loadProviderKeys(selectedProviderForKeys);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to remove credential');
    }
  };

  const handleResetCredential = async (id: string) => {
    try {
      if (window.electronAPI && selectedProviderForKeys) {
        await window.electronAPI.credentials.reset(id);
        await loadProviderKeys(selectedProviderForKeys);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to reset credential');
    }
  };

  const groupedModels = models.reduce(
    (acc: Record<string, ModelWithProvider[]>, model: ModelWithProvider) => {
      const key = model.isCustom ? 'Custom Models' : 'Built-in Models';
      if (!acc[key]) acc[key] = [];
      acc[key].push(model);
      return acc;
    },
    {}
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">
            Configure your AI providers and manage application settings.
          </p>
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-2 p-4 rounded-lg ${testResult.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'}`}
          >
            {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            <span className="text-sm">{testResult.message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTestResult(null)}
              className="ml-auto"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Default Model Setting */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Default Model</h2>
            <p className="text-sm text-muted-foreground">
              Set the default model for Quick Chat and new agents.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={defaultModel}
              onChange={(e) => handleSetDefaultModel(e.target.value)}
              className="flex h-9 w-[300px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              disabled={models.length === 0}
            >
              {models.length === 0 ? (
                <option value="">No models available</option>
              ) : (
                Object.entries(groupedModels).map(([group, groupModels]) => (
                  <optgroup key={group} label={group}>
                    {groupModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} {model.providerName ? `(${model.providerName})` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
            {defaultModel && (
              <span className="text-sm text-muted-foreground">
                Default: {models.find((m) => m.id === defaultModel)?.displayName}
              </span>
            )}
          </div>
        </div>

        {/* Security Settings */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Security</h2>
            <p className="text-sm text-muted-foreground">
              Configure security settings for command execution.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-semibold">Skip Security Prompts</h3>
              <p className="text-sm text-muted-foreground">
                Allow commands to execute without approval prompts. Use with caution.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={skipSecurityPrompts}
                onChange={(e) => handleToggleSkipSecurity(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* API Server Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">API Server (OpenAI-Compatible)</h2>
            <p className="text-sm text-muted-foreground">
              Expose a local OpenAI-compatible API for external tools.
            </p>
          </div>
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Enable API Server</h3>
                <p className="text-sm text-muted-foreground">
                  Start an HTTP server on port {apiServerPort}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={apiServerEnabled}
                  onChange={(e) => handleToggleApiServer(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="apiServerPort">Port</Label>
                <Input
                  id="apiServerPort"
                  type="number"
                  value={apiServerPort}
                  onChange={(e) => setApiServerPort(parseInt(e.target.value) || 18790)}
                  placeholder="18790"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiServerAuthToken">Auth Token (optional)</Label>
                <Input
                  id="apiServerAuthToken"
                  type="password"
                  value={apiServerAuthToken}
                  onChange={(e) => setApiServerAuthToken(e.target.value)}
                  placeholder="Leave empty for no auth"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveApiServerConfig}>Save API Config</Button>
            </div>
            {apiServerEnabled && (
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
                <p className="text-sm text-green-800 dark:text-green-200">
                  API Server running at http://127.0.0.1:{apiServerPort}/v1
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Smart Routing Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Smart Model Routing</h2>
            <p className="text-sm text-muted-foreground">
              Route simple messages to a cheaper model to save costs.
            </p>
          </div>
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Enable Smart Routing</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically route simple/complex messages to different models
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={smartRoutingEnabled}
                  onChange={(e) => setSmartRoutingEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="smartRoutingCheapModel">Cheap Model ID</Label>
                <Input
                  id="smartRoutingCheapModel"
                  value={smartRoutingCheapModel}
                  onChange={(e) => setSmartRoutingCheapModel(e.target.value)}
                  placeholder="e.g., gpt-3.5-turbo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smartRoutingCharThreshold">Char Threshold</Label>
                <Input
                  id="smartRoutingCharThreshold"
                  type="number"
                  value={smartRoutingCharThreshold}
                  onChange={(e) => setSmartRoutingCharThreshold(parseInt(e.target.value) || 160)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smartRoutingWordThreshold">Word Threshold</Label>
                <Input
                  id="smartRoutingWordThreshold"
                  type="number"
                  value={smartRoutingWordThreshold}
                  onChange={(e) => setSmartRoutingWordThreshold(parseInt(e.target.value) || 28)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveSmartRoutingConfig}>Save Routing Config</Button>
            </div>
          </div>
        </div>

        {/* Providers Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">AI Providers</h2>
              <p className="text-sm text-muted-foreground">
                Connect to OpenAI, Anthropic, Ollama, or custom providers.
              </p>
            </div>
            <Button onClick={() => setShowAddProvider(!showAddProvider)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Provider
            </Button>
          </div>

          {showAddProvider && (
            <form onSubmit={handleAddProvider} className="space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="My OpenAI" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protocol">Protocol</Label>
                  <select
                    id="protocol"
                    name="protocol"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    required
                  >
                    <option value="openai">OpenAI Compatible</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama Local</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">Base URL</Label>
                  <Input
                    id="baseUrl"
                    name="baseUrl"
                    placeholder="https://api.openai.com/v1"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    For OpenAI: https://api.openai.com/v1
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input id="apiKey" name="apiKey" type="password" placeholder="sk-..." required />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddProvider(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Provider</Button>
              </div>
            </form>
          )}

          {editingProvider && (
            <form
              onSubmit={handleUpdateProvider}
              className="space-y-4 rounded-lg border p-4 bg-muted/50"
            >
              <h3 className="font-semibold">Edit Provider: {editingProvider.name}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input id="edit-name" name="name" defaultValue={editingProvider.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-protocol">Protocol</Label>
                  <select
                    id="edit-protocol"
                    name="protocol"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    defaultValue={editingProvider.protocol}
                    disabled
                  >
                    <option value="openai">OpenAI Compatible</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama Local</option>
                    <option value="custom">Custom</option>
                  </select>
                  <p className="text-xs text-muted-foreground">Protocol cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-baseUrl">Base URL</Label>
                  <Input
                    id="edit-baseUrl"
                    name="baseUrl"
                    defaultValue={editingProvider.baseUrl}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-apiKey">API Key</Label>
                  <Input
                    id="edit-apiKey"
                    name="apiKey"
                    type="password"
                    placeholder="Leave empty to keep current key"
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to keep existing key</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingProvider(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <h3 className="font-semibold">{provider.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {provider.protocol} · {provider.baseUrl}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadProviderKeys(provider.id)}>
                    Keys
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestProvider(provider.id)}
                    disabled={testingProvider === provider.id}
                  >
                    {testingProvider === provider.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingProvider(provider)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteProvider(provider.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credential Pool Section (shown when a provider is selected) */}
        {selectedProviderForKeys && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  API Key Pool - {providers.find((p) => p.id === selectedProviderForKeys)?.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage multiple API keys with automatic failover.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedProviderForKeys(null)}>
                Close
              </Button>
            </div>

            {/* Add new credential */}
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-semibold text-sm">Add API Key</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="Label (e.g., Key 1)"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="API Key"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                />
                <Button onClick={handleAddCredential} disabled={!newKeyValue.trim()}>
                  Add Key
                </Button>
              </div>
            </div>

            {/* Existing credentials */}
            <div className="space-y-2">
              {(providerKeys || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No additional keys in the pool. Only the provider&apos;s default key will be used.
                </p>
              ) : (
                (providerKeys || []).map((key: any) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          key.status === 'active'
                            ? 'bg-green-500'
                            : key.status === 'cooldown'
                              ? 'bg-yellow-500'
                              : key.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-gray-400'
                        }`}
                      />
                      <div>
                        <span className="font-medium text-sm">{key.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          Priority: {key.priority} | Requests: {key.request_count}
                          {key.status === 'cooldown' && ' | Cooldown active'}
                          {key.last_error && ` | Error: ${key.last_error}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {key.status !== 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetCredential(key.id)}
                        >
                          Reset
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveCredential(key.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Models Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Models</h2>
              <p className="text-sm text-muted-foreground">
                Manage available AI models from your providers.
              </p>
            </div>
            <Button
              onClick={() => setShowAddModel(!showAddModel)}
              disabled={providers.length === 0}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Custom Model
            </Button>
          </div>

          {showAddModel && (
            <form id="addModelForm" className="space-y-4 rounded-lg border p-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> You can save the model directly without testing if
                  you&apos;re confident about the model ID.
                  <br />
                  <strong>Optional:</strong> Test the connection first to verify the model is
                  accessible.
                  <br />
                  <em>
                    The provider&apos;s API key will be used if you leave the API Key field empty.
                  </em>
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="providerId">Provider</Label>
                  <select
                    id="providerId"
                    name="providerId"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    required
                  >
                    <option value="">Select a provider</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} ({provider.protocol})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modelId">Model ID</Label>
                  <Input
                    id="modelId"
                    name="modelId"
                    placeholder="gpt-4, claude-3-sonnet, qwen-turbo, etc."
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Examples: gpt-4, claude-3-sonnet-20240229, qwen-turbo, glm-4
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="displayName">Display Name (optional)</Label>
                  <Input id="displayName" name="displayName" placeholder="GPT-4" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="apiKey">API Key (optional - overrides provider&apos;s key)</Label>
                  <Input
                    id="apiKey"
                    name="apiKey"
                    type="password"
                    placeholder="Leave empty to use provider's saved API key"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the provider&apos;s API key. Only fill this if you want to
                    use a different key for this model.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleResetAddModel}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestModelOnly}
                  disabled={testingModel}
                >
                  {testingModel ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Test (Optional)
                    </>
                  )}
                </Button>
                <Button type="button" onClick={handleSaveModelOnly} variant="default">
                  <Save className="mr-2 h-4 w-4" />
                  Save Model
                </Button>
              </div>
            </form>
          )}

          {models.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
              {providers.length === 0
                ? 'Add a provider first, then you can add models.'
                : 'No models configured yet. Click "Add Custom Model" to get started.'}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedModels).map(([group, groupModels]) => (
                <div key={group}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">{group}</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {groupModels.map((model) => (
                      <div
                        key={model.id}
                        className={`flex items-center justify-between rounded-lg border p-4 ${defaultModel === model.id ? 'border-primary bg-primary/5' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <h3 className="font-semibold">{model.displayName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {model.providerName} · {model.modelId}
                            </p>
                          </div>
                          {defaultModel === model.id && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {defaultModel !== model.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefaultModel(model.id)}
                            >
                              Set Default
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteModel(model.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
