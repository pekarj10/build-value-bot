import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => Promise<void>;
}

export function DeleteProjectDialog({ 
  open, 
  onOpenChange, 
  projectName,
  onConfirm 
}: DeleteProjectDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const canDelete = confirmText === projectName;

  const handleConfirm = async () => {
    if (!canDelete) return;
    
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
      setConfirmText('');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!isDeleting) {
      onOpenChange(open);
      if (!open) setConfirmText('');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Project</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              This action cannot be undone. This will permanently delete the project
              <strong className="text-foreground"> "{projectName}"</strong> and all of its 
              cost items, files, and analysis data.
            </p>
            <p className="text-sm">
              Please type <strong className="text-foreground">{projectName}</strong> to confirm.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="py-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type project name to confirm"
            disabled={isDeleting}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canDelete || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Project'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
