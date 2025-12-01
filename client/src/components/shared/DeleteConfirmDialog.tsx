import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

interface DeleteConfirmDialogProps {
  onConfirm: () => void;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
}

export function DeleteConfirmDialog({
  onConfirm,
  trigger,
  title = "Delete Record",
  description = "This action cannot be undone. This will permanently remove this record from the system."
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger || (
            <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
                <Trash2 className="w-4 h-4" />
            </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="border-l-4 border-l-destructive">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl flex items-center gap-2 text-destructive">
             <Trash2 className="w-6 h-6" />
             {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base pt-2">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel className="border-primary/20">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md">
            Yes, Delete It
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
