import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUploader } from './FileUploader';
import { Loader2 } from 'lucide-react';

interface UploadSpreadsheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: File[]) => Promise<void>;
  isUploading?: boolean;
}

export function UploadSpreadsheetDialog({
  open,
  onOpenChange,
  onUpload,
  isUploading = false,
}: UploadSpreadsheetDialogProps) {
  const [files, setFiles] = useState<File[]>([]);

  const handleFilesUploaded = (uploadedFiles: File[]) => {
    setFiles(uploadedFiles);
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    await onUpload(files);
    setFiles([]);
    onOpenChange(false);
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Spreadsheet</DialogTitle>
          <DialogDescription>
            Upload an Excel or PDF file containing cost items to add to this project.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <FileUploader onFilesUploaded={handleFilesUploaded} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={files.length === 0 || isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Upload & Process'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
