'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Trash2,
  Edit,
  Code,
  Play,
  Search,
  FolderOpen,
  Book,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
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

interface SkillMetadata {
  author?: string;
  version?: string;
  domain?: string;
  triggers?: string[];
  role?: string;
  scope?: string;
  outputFormat?: string;
  relatedSkills?: string[];
}

interface Skill {
  id: string;
  name: string;
  description?: string;
  schema_json?: object;
  code?: string;
  metadata_json?: SkillMetadata;
  license?: string;
  allowed_tools?: string[];
  content?: string;
  is_builtin?: boolean;
  enabled?: boolean;
  created_at: number;
  updated_at: number;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [filteredSkills, setFilteredSkills] = useState<Skill[]>([]);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [testingSkill, setTestingSkill] = useState<Skill | null>(null);
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [testInput, setTestInput] = useState('{}');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    output?: unknown;
    error?: string;
  } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    failed: number;
    errors: Array<{ skill: string; error: string }>;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    filterSkills();
  }, [skills, searchQuery, selectedDomain]);

  const loadSkills = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.skills.list();
        setSkills(data);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  };

  const filterSkills = () => {
    let filtered = [...skills];

    // Filter by domain
    if (selectedDomain !== 'all') {
      filtered = filtered.filter((skill) => skill.metadata_json?.domain === selectedDomain);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description?.toLowerCase().includes(query) ||
          skill.metadata_json?.triggers?.some((t) => t.toLowerCase().includes(query))
      );
    }

    setFilteredSkills(filtered);
  };

  const handleImportSkills = async () => {
    if (window.electronAPI) {
      const selectedPath = await window.electronAPI.dialog.selectDirectory();

      if (!selectedPath) {
        return;
      }

      setIsImporting(true);
      setImportResult(null);

      try {
        const importData = await window.electronAPI.skills.importDir(selectedPath);
        setImportResult(importData);
        await loadSkills();
      } catch (error) {
        console.error('Failed to import skills:', error);
        alert('Failed to import skills. Please try again.');
      } finally {
        setIsImporting(false);
      }
    }
  };

  const handleToggleSkill = async (skill: Skill) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.skills.update(skill.id, { enabled: !skill.enabled });
        await loadSkills();
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error);
    }
  };

  const handleAddSkill = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.skills.create({
          name: formData.get('name') as string,
          description: (formData.get('description') as string) || undefined,
          code: (formData.get('code') as string) || undefined,
        });
        await loadSkills();
        setShowAddSkill(false);
      }
    } catch (error) {
      console.error('Failed to add skill:', error);
      alert('Failed to add skill. Please try again.');
    }
  };

  const handleUpdateSkill = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingSkill) return;

    const formData = new FormData(e.currentTarget);

    try {
      if (window.electronAPI) {
        await window.electronAPI.skills.update(editingSkill.id, {
          name: formData.get('name') as string,
          description: (formData.get('description') as string) || undefined,
          code: (formData.get('code') as string) || undefined,
        });
        await loadSkills();
        setEditingSkill(null);
      }
    } catch (error) {
      console.error('Failed to update skill:', error);
      alert('Failed to update skill. Please try again.');
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;

    try {
      if (window.electronAPI) {
        await window.electronAPI.skills.delete(id);
        await loadSkills();
      }
    } catch (error) {
      console.error('Failed to delete skill:', error);
    }
  };

  const handleExecuteSkill = async () => {
    if (!testingSkill) return;

    setIsExecuting(true);
    setTestResult(null);

    try {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(testInput);
      } catch {
        setTestResult({ success: false, error: 'Invalid JSON input' });
        setIsExecuting(false);
        return;
      }

      if (window.electronAPI) {
        const result = await window.electronAPI.skills.execute(testingSkill.id, { input });
        setTestResult(result);
      }
    } catch (error) {
      console.error('Failed to execute skill:', error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Skills Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage and use expert skills for AI assistance
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImportSkills} variant="outline" disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Import Skills
                </>
              )}
            </Button>
            <Button onClick={() => setShowAddSkill(!showAddSkill)}>
              <Plus className="mr-2 h-4 w-4" />
              New Skill
            </Button>
          </div>
        </div>

        {/* Import Result Dialog */}
        {importResult && (
          <div className="rounded-lg border p-4 bg-muted/50">
            <h3 className="font-semibold mb-2">Import Results</h3>
            <div className="grid grid-cols-4 gap-4 mb-2">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
                <div className="text-xs text-muted-foreground">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{importResult.updated}</div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={() => setImportResult(null)}>
                  Close
                </Button>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2">
                <div className="text-sm font-medium mb-1">Errors:</div>
                {importResult.errors.map((err, i) => (
                  <div key={i} className="text-xs text-red-600">
                    {err.skill}: {err.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search skills by name, description, or triggers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="language">Languages</SelectItem>
              <SelectItem value="frontend">Frontend</SelectItem>
              <SelectItem value="backend">Backend</SelectItem>
              <SelectItem value="security">Security</SelectItem>
              <SelectItem value="quality">Quality</SelectItem>
              <SelectItem value="workflow">Workflow</SelectItem>
              <SelectItem value="infrastructure">Infrastructure</SelectItem>
              <SelectItem value="database">Database</SelectItem>
              <SelectItem value="devops">DevOps</SelectItem>
              <SelectItem value="api-architecture">API Architecture</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Skills Count */}
        <div className="text-sm text-muted-foreground">
          Showing {filteredSkills.length} of {skills.length} skills
        </div>

        {showAddSkill && (
          <form onSubmit={handleAddSkill} className="space-y-4 rounded-lg border p-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Skill Name</Label>
                <Input id="name" name="name" placeholder="My Custom Skill" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="What does this skill do?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Python Code</Label>
                <textarea
                  id="code"
                  name="code"
                  className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="# Write your Python code here&#10;def execute(**kwargs):&#10;    # Your skill logic&#10;    return {'result': 'success'}"
                />
                <p className="text-xs text-muted-foreground">
                  Define a function called `execute` that accepts keyword arguments and returns a
                  result.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAddSkill(false)}>
                Cancel
              </Button>
              <Button type="submit">Create Skill</Button>
            </div>
          </form>
        )}

        {editingSkill && (
          <form
            onSubmit={handleUpdateSkill}
            className="space-y-4 rounded-lg border p-4 bg-muted/50"
          >
            <h3 className="font-semibold">Edit Skill: {editingSkill.name}</h3>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Skill Name</Label>
                <Input id="edit-name" name="name" defaultValue={editingSkill.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  name="description"
                  defaultValue={editingSkill.description || ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-code">Python Code</Label>
                <textarea
                  id="edit-code"
                  name="code"
                  className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  defaultValue={editingSkill.code || ''}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingSkill(null)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        )}

        {filteredSkills.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            {skills.length === 0
              ? 'No skills defined yet. Import skills or create your own.'
              : 'No skills match your search criteria.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSkills.map((skill) => (
              <div
                key={skill.id}
                className={`flex flex-col rounded-lg border p-4 transition-all ${
                  skill.enabled ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {skill.is_builtin ? (
                      <Book className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Code className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <h3 className="font-semibold truncate">{skill.name}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleToggleSkill(skill)}
                  >
                    {skill.enabled ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>

                {/* Domain Badge */}
                {skill.metadata_json?.domain && (
                  <Badge variant="secondary" className="w-fit mb-2 text-xs">
                    {skill.metadata_json.domain}
                  </Badge>
                )}

                {skill.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {skill.description}
                  </p>
                )}

                {/* Triggers */}
                {skill.metadata_json?.triggers && skill.metadata_json.triggers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {skill.metadata_json.triggers.slice(0, 3).map((trigger, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {trigger}
                      </Badge>
                    ))}
                    {skill.metadata_json.triggers.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{skill.metadata_json.triggers.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Metadata info */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  {skill.metadata_json?.role && <span>{skill.metadata_json.role}</span>}
                  {skill.metadata_json?.scope && <span>• {skill.metadata_json.scope}</span>}
                  {skill.metadata_json?.version && <span>• v{skill.metadata_json.version}</span>}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  {skill.is_builtin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setViewingSkill(skill)}
                    >
                      <Book className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setTestingSkill(skill);
                        setTestInput('{}');
                        setTestResult(null);
                      }}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Test
                    </Button>
                  )}
                  {!skill.is_builtin && (
                    <Button variant="outline" size="sm" onClick={() => setEditingSkill(skill)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleDeleteSkill(skill.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Skill Dialog */}
      <Dialog open={!!testingSkill} onOpenChange={() => setTestingSkill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Test Skill: {testingSkill?.name}</DialogTitle>
            <DialogDescription>
              Run this skill with test input to verify it works correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-input">Input (JSON)</Label>
              <Textarea
                id="test-input"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder='{"key": "value"}'
                className="font-mono text-sm min-h-[100px]"
              />
            </div>

            {testResult && (
              <div className="space-y-2">
                <Label>Result</Label>
                <div
                  className={`rounded-lg p-4 font-mono text-sm ${
                    testResult.success
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                  }`}
                >
                  {testResult.success ? (
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(testResult.output, null, 2)}
                    </pre>
                  ) : (
                    <p>{testResult.error}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTestingSkill(null);
                  setTestResult(null);
                }}
              >
                Close
              </Button>
              <Button onClick={handleExecuteSkill} disabled={isExecuting}>
                {isExecuting ? 'Running...' : 'Run Test'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Skill Dialog */}
      <Dialog open={!!viewingSkill} onOpenChange={() => setViewingSkill(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="h-5 w-5" />
              {viewingSkill?.name}
            </DialogTitle>
            <DialogDescription>
              {viewingSkill?.metadata_json?.domain && (
                <Badge variant="secondary" className="mt-2">
                  {viewingSkill.metadata_json.domain}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          {viewingSkill && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="triggers">Triggers</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{viewingSkill.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Role</h4>
                    <p className="text-sm text-muted-foreground">
                      {viewingSkill.metadata_json?.role || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Scope</h4>
                    <p className="text-sm text-muted-foreground">
                      {viewingSkill.metadata_json?.scope || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Version</h4>
                    <p className="text-sm text-muted-foreground">
                      {viewingSkill.metadata_json?.version || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">License</h4>
                    <p className="text-sm text-muted-foreground">{viewingSkill.license || 'N/A'}</p>
                  </div>
                </div>
                {viewingSkill.allowed_tools && viewingSkill.allowed_tools.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Allowed Tools</h4>
                    <div className="flex flex-wrap gap-2">
                      {viewingSkill.allowed_tools.map((tool, i) => (
                        <Badge key={i} variant="outline">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="content" className="space-y-4">
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <pre className="whitespace-pre-wrap break-words text-sm">
                    {viewingSkill.content || 'No content available'}
                  </pre>
                </div>
              </TabsContent>
              <TabsContent value="triggers" className="space-y-4">
                {viewingSkill.metadata_json?.triggers &&
                viewingSkill.metadata_json.triggers.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground mb-4">
                      This skill is triggered by the following keywords:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {viewingSkill.metadata_json.triggers.map((trigger, i) => (
                        <Badge key={i} variant="secondary" className="text-sm">
                          <Tag className="h-3 w-3 mr-1" />
                          {trigger}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No triggers defined</p>
                )}
              </TabsContent>
              <TabsContent value="metadata" className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Author</h4>
                    <p className="text-sm text-muted-foreground">
                      {viewingSkill.metadata_json?.author || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Output Format</h4>
                    <p className="text-sm text-muted-foreground">
                      {viewingSkill.metadata_json?.outputFormat || 'N/A'}
                    </p>
                  </div>
                  {viewingSkill.metadata_json?.relatedSkills &&
                    viewingSkill.metadata_json.relatedSkills.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Related Skills</h4>
                        <div className="flex flex-wrap gap-2">
                          {viewingSkill.metadata_json.relatedSkills.map((skill, i) => (
                            <Badge key={i} variant="outline">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  <div>
                    <h4 className="font-semibold mb-2">Created</h4>
                    <p className="text-sm text-muted-foreground">
                      {new Date(viewingSkill.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Last Updated</h4>
                    <p className="text-sm text-muted-foreground">
                      {new Date(viewingSkill.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
