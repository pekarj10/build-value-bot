import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { FileUploader } from '@/components/project/FileUploader';
import { ManualEntryForm } from '@/components/project/ManualEntryForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  PROJECT_TYPE_LABELS, 
  SUPPORTED_COUNTRIES, 
  CURRENCIES,
  ProjectType 
} from '@/types/project';
import { useProject } from '@/hooks/useProject';
import { useCostAnalysis } from '@/hooks/useCostAnalysis';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Building2, FileUp, Loader2, PenLine, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type Step = 'details' | 'method' | 'upload' | 'manual';
type InputMethod = 'upload' | 'manual';

interface ManualItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  originalPrice?: number;
}

export default function NewProject() {
  const navigate = useNavigate();
  const { isLoading, createProject, uploadFile, parseExcelFile } = useProject();
  const { analyzeItems } = useCostAnalysis();
  const [step, setStep] = useState<Step>('details');
  const [inputMethod, setInputMethod] = useState<InputMethod | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    currency: '',
    projectType: '' as ProjectType | '',
    notes: '',
  });
  const [files, setFiles] = useState<File[]>([]);

  const handleCountryChange = (countryCode: string) => {
    const country = SUPPORTED_COUNTRIES.find(c => c.code === countryCode);
    setFormData(prev => ({
      ...prev,
      country: countryCode,
      currency: country?.currency || prev.currency,
    }));
  };

  const isDetailsValid = formData.name && formData.country && formData.currency && formData.projectType;

  const handleMethodSelect = (method: InputMethod) => {
    setInputMethod(method);
    setStep(method);
  };

  const handleStartFileProcessing = async () => {
    if (files.length === 0 || !formData.projectType) return;

    setIsProcessing(true);
    try {
      const projectId = await createProject({
        name: formData.name,
        country: formData.country,
        currency: formData.currency,
        projectType: formData.projectType as ProjectType,
        notes: formData.notes || undefined,
      });

      if (!projectId) {
        throw new Error('Failed to create project');
      }

      let totalParsed = 0;
      for (const file of files) {
        const storagePath = await uploadFile(projectId, file);
        if (storagePath) {
          const success = await parseExcelFile(projectId, storagePath);
          if (success) totalParsed++;
        }
      }

      if (totalParsed === 0) {
        toast.error('No files could be parsed');
        return;
      }

      navigate(`/project/${projectId}/processing`);
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Failed to start processing');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (items: ManualItem[]) => {
    if (!formData.projectType) return;

    setIsProcessing(true);
    try {
      const projectId = await createProject({
        name: formData.name,
        country: formData.country,
        currency: formData.currency,
        projectType: formData.projectType as ProjectType,
        notes: formData.notes || undefined,
      });

      if (!projectId) {
        throw new Error('Failed to create project');
      }

      // Insert cost items directly
      const itemsToInsert = items.map(item => ({
        project_id: projectId,
        original_description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        original_unit_price: item.originalPrice || null,
        status: 'clarification' as const,
        sheet_name: 'Manual Entry',
        trade: 'General',
      }));

      const { error } = await supabase
        .from('cost_items')
        .insert(itemsToInsert);

      if (error) {
        throw error;
      }

      // Update project with item count
      await supabase
        .from('projects')
        .update({ 
          status: 'processing', 
          total_items: items.length 
        })
        .eq('id', projectId);

      toast.success(`Created project with ${items.length} items`);
      navigate(`/project/${projectId}/processing`);
    } catch (error) {
      console.error('Manual entry error:', error);
      toast.error('Failed to create project');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStepNumber = () => {
    if (step === 'details') return 1;
    if (step === 'method') return 2;
    return 3;
  };

  return (
    <AppLayout>
      <PageHeader
        title="New Project"
        description="Create a new cost analysis project"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Projects', href: '/projects' },
          { label: 'New Project' },
        ]}
      />

      <div className="p-8 max-w-3xl">
        {/* Step indicator */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <div className={`step-circle ${step === 'details' ? 'step-active' : 'step-complete'}`}>
              {step !== 'details' ? '✓' : '1'}
            </div>
            <span className="font-medium">Details</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={`step-circle ${step === 'method' ? 'step-active' : getStepNumber() > 2 ? 'step-complete' : 'step-pending'}`}>
              {getStepNumber() > 2 ? '✓' : '2'}
            </div>
            <span className={getStepNumber() >= 2 ? 'font-medium' : 'text-muted-foreground'}>
              Input Method
            </span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={`step-circle ${step === 'upload' || step === 'manual' ? 'step-active' : 'step-pending'}`}>
              3
            </div>
            <span className={step === 'upload' || step === 'manual' ? 'font-medium' : 'text-muted-foreground'}>
              Add Items
            </span>
          </div>
        </div>

        {/* Step 1: Project Details */}
        {step === 'details' && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Project Details</h2>
                <p className="text-sm text-muted-foreground">
                  Define the basic project parameters
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Prague Residential Tower"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Select value={formData.country} onValueChange={handleCountryChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_COUNTRIES.map(country => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select 
                    value={formData.currency} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, currency: v }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(currency => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="type">Project Type</Label>
                <Select 
                  value={formData.projectType} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, projectType: v as ProjectType }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional context for the analysis..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setStep('method')} disabled={!isDetailsValid}>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Input Method Selection */}
        {step === 'method' && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">How would you like to add cost items?</h2>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred input method
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleMethodSelect('upload')}
                className="p-6 border-2 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4 group-hover:bg-primary/10">
                  <FileUp className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                </div>
                <h3 className="font-semibold mb-1">Upload Files</h3>
                <p className="text-sm text-muted-foreground">
                  Upload Excel or PDF files with cost breakdowns
                </p>
              </button>

              <button
                onClick={() => handleMethodSelect('manual')}
                className="p-6 border-2 rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4 group-hover:bg-primary/10">
                  <PenLine className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                </div>
                <h3 className="font-semibold mb-1">Manual Entry</h3>
                <p className="text-sm text-muted-foreground">
                  Enter cost items one by one for analysis
                </p>
              </button>
            </div>

            <div className="flex justify-start pt-4 border-t">
              <Button variant="outline" onClick={() => setStep('details')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3a: File Upload */}
        {step === 'upload' && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Upload Cost Data</h2>
                <p className="text-sm text-muted-foreground">
                  Upload Excel or PDF files containing cost breakdowns
                </p>
              </div>
            </div>

            <FileUploader onFilesUploaded={setFiles} />

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep('method')} disabled={isProcessing}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleStartFileProcessing} disabled={files.length === 0 || isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Start Analysis
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3b: Manual Entry */}
        {step === 'manual' && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <PenLine className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Manual Entry</h2>
                <p className="text-sm text-muted-foreground">
                  Add cost items for AI-powered analysis
                </p>
              </div>
            </div>

            <ManualEntryForm 
              onSubmit={handleManualSubmit}
              isSubmitting={isProcessing}
            />

            <div className="flex justify-start pt-4 border-t">
              <Button variant="outline" onClick={() => setStep('method')} disabled={isProcessing}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}