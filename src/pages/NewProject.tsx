import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout, PageHeader } from '@/components/layout/AppLayout';
import { FileUploader } from '@/components/project/FileUploader';
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
import { ArrowRight, Building2, MapPin, FileUp } from 'lucide-react';

type Step = 'details' | 'upload';

export default function NewProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('details');
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

  const handleStartProcessing = () => {
    // In a real app, this would create the project and start processing
    navigate('/project/1/processing');
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
              {step === 'details' ? '1' : '✓'}
            </div>
            <span className="font-medium">Project Details</span>
          </div>
          <div className="flex-1 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className={`step-circle ${step === 'upload' ? 'step-active' : 'step-pending'}`}>
              2
            </div>
            <span className={step === 'upload' ? 'font-medium' : 'text-muted-foreground'}>
              Upload Files
            </span>
          </div>
        </div>

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
              <Button onClick={() => setStep('upload')} disabled={!isDetailsValid}>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

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
              <Button variant="outline" onClick={() => setStep('details')}>
                Back
              </Button>
              <Button onClick={handleStartProcessing} disabled={files.length === 0}>
                Start Analysis
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
