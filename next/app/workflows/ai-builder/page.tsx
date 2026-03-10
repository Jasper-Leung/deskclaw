'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sparkles,
  Save,
  Edit,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WorkflowCanvas } from '@/components/workflow/workflow-canvas';
import type { Node, Edge } from '@xyflow/react';

interface Model {
  id: string;
  displayName: string;
  providerId: string;
}

interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
}

export default function AIBuilderPage() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'preview' | 'explain'>('input');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      if (window.electronAPI) {
        const modelsData = await window.electronAPI.models.list();
        setModels(modelsData);
        if (modelsData.length > 0) {
          setSelectedModel(modelsData[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setError('Failed to load available models');
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please describe the workflow you want to create');
      return;
    }

    if (!selectedModel) {
      setError('Please select a model to use for generation');
      return;
    }

    setError('');
    setSuccess('');
    setIsGenerating(true);

    try {
      const result = await window.electronAPI.workflows.generate(description, selectedModel);

      if (result.success) {
        setGeneratedWorkflow(result.workflow);
        setActiveTab('preview');
        setSuccess('Workflow generated successfully! You can preview and edit it before saving.');
      } else {
        setError(result.error || 'Failed to generate workflow');
      }
    } catch (error: any) {
      console.error('Failed to generate workflow:', error);
      setError(error.message || 'Failed to generate workflow');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExplain = async () => {
    if (!generatedWorkflow) return;

    setIsExplaining(true);
    setError('');

    try {
      const result = await window.electronAPI.workflows.explain(generatedWorkflow, selectedModel);

      if (result.success) {
        setExplanation(result.explanation || '');
        setActiveTab('explain');
      } else {
        setError(result.error || 'Failed to explain workflow');
      }
    } catch (error: any) {
      console.error('Failed to explain workflow:', error);
      setError(error.message || 'Failed to explain workflow');
    } finally {
      setIsExplaining(false);
    }
  };

  const handleSave = async () => {
    if (!generatedWorkflow) return;

    setIsSaving(true);
    setError('');

    try {
      const result = await window.electronAPI.workflows.saveGenerated(generatedWorkflow);

      if (result.success) {
        setSuccess(`Workflow "${generatedWorkflow.name}" saved successfully!`);
        setTimeout(() => {
          router.push('/workflows');
        }, 1500);
      } else {
        setError(result.error || 'Failed to save workflow');
      }
    } catch (error: any) {
      console.error('Failed to save workflow:', error);
      setError(error.message || 'Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditInWorkflowPage = () => {
    if (generatedWorkflow) {
      // Store in sessionStorage for the workflow page to pick up
      sessionStorage.setItem('pendingWorkflow', JSON.stringify(generatedWorkflow));
      router.push('/workflows');
    }
  };

  const exampleDescriptions = [
    {
      title: 'Web Research & Report',
      description:
        'Create a workflow that searches the web for information about a topic, compiles the findings into a summary, and saves it as a markdown file.',
    },
    {
      title: 'File Monitor & Process',
      description:
        'Create a workflow that monitors a directory for new text files, reads their content, analyzes them with an AI agent, and saves the analysis results.',
    },
    {
      title: 'Stock Portfolio Tracker',
      description:
        'Create a workflow that fetches stock prices for a portfolio of stocks, calculates the total value and daily change, and generates a summary report.',
    },
    {
      title: 'Automated Testing Pipeline',
      description:
        'Create a workflow that runs tests for a project, analyzes the results, creates a bug report if tests fail, and sends a notification with the results.',
    },
  ];

  return (
    <AppShell>
      <div className="container mx-auto py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/workflows')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Sparkles className="h-8 w-8 text-purple-500" />
                AI Workflow Builder
              </h1>
              <p className="text-muted-foreground mt-1">
                Describe what you want to automate, and AI will create a workflow for you
              </p>
            </div>
          </div>
        </div>

        {/* Success Alert */}
        {success && (
          <Alert className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 border-red-500 bg-red-50 dark:bg-red-950">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700 dark:text-red-300">{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="input">1. Describe</TabsTrigger>
            <TabsTrigger value="preview" disabled={!generatedWorkflow}>
              2. Preview & Edit
            </TabsTrigger>
            <TabsTrigger value="explain" disabled={!generatedWorkflow}>
              3. Explanation
            </TabsTrigger>
          </TabsList>

          {/* Input Tab */}
          <TabsContent value="input" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Describe Your Workflow</CardTitle>
                <CardDescription>
                  Explain in plain English what you want to automate. Be specific about the steps
                  and desired outcome.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Model Selection */}
                <div className="space-y-2">
                  <Label htmlFor="model">AI Model</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Choose a more capable model for complex workflows, or a faster model for simple
                    ones.
                  </p>
                </div>

                {/* Description Input */}
                <div className="space-y-2">
                  <Label htmlFor="description">Workflow Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Example: Create a workflow that searches the web for information about AI trends, compiles a summary, and saves it to a file named 'ai_report.md'..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={8}
                    className="resize-none"
                  />
                  <p className="text-sm text-muted-foreground">
                    The more detailed your description, the better the generated workflow will be.
                  </p>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !description.trim() || !selectedModel}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Generating Workflow...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Generate Workflow
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Example Descriptions */}
            <Card>
              <CardHeader>
                <CardTitle>Need Inspiration?</CardTitle>
                <CardDescription>Click an example to get started</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {exampleDescriptions.map((example, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="h-auto p-4 text-left justify-start"
                      onClick={() => setDescription(example.description)}
                    >
                      <div>
                        <div className="font-medium mb-1">{example.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {example.description}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-6">
            {generatedWorkflow && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{generatedWorkflow.name}</CardTitle>
                    <CardDescription>{generatedWorkflow.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Workflow
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={handleEditInWorkflowPage}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit in Workflow Editor
                      </Button>
                      <Button variant="outline" onClick={handleExplain} disabled={isExplaining}>
                        {isExplaining ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Explaining...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Explain Workflow
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="h-[600px] border">
                      <WorkflowCanvas
                        nodes={generatedWorkflow.nodes}
                        edges={generatedWorkflow.edges}
                        onNodesChange={(nodes) =>
                          setGeneratedWorkflow({ ...generatedWorkflow, nodes })
                        }
                        onEdgesChange={(edges) =>
                          setGeneratedWorkflow({ ...generatedWorkflow, edges })
                        }
                        readonly={false}
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Explanation Tab */}
          <TabsContent value="explain" className="space-y-6">
            {generatedWorkflow && (
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Explanation</CardTitle>
                  <CardDescription>
                    Understand how this workflow works and when to use it
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {explanation ? (
                    <div className="prose dark:prose-invert max-w-none">
                      {explanation.split('\n').map((line, index) => {
                        if (line.startsWith('# ')) {
                          return (
                            <h1 key={index} className="text-2xl font-bold mt-4 mb-2">
                              {line.substring(2)}
                            </h1>
                          );
                        }
                        if (line.startsWith('## ')) {
                          return (
                            <h2 key={index} className="text-xl font-bold mt-3 mb-2">
                              {line.substring(3)}
                            </h2>
                          );
                        }
                        if (line.startsWith('### ')) {
                          return (
                            <h3 key={index} className="text-lg font-bold mt-2 mb-1">
                              {line.substring(4)}
                            </h3>
                          );
                        }
                        if (line.startsWith('- ')) {
                          return (
                            <li key={index} className="ml-4">
                              {line.substring(2)}
                            </li>
                          );
                        }
                        if (line.match(/^\d+\./)) {
                          return (
                            <li key={index} className="ml-4 list-decimal">
                              {line.substring(line.indexOf('.') + 1)}
                            </li>
                          );
                        }
                        if (line.trim() === '') {
                          return <br key={index} />;
                        }
                        return <p key={index}>{line}</p>;
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      Click "Explain Workflow" to get an explanation of how this workflow works
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
