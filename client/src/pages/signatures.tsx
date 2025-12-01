import { useAppStore, Signature } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, RefreshCw, Search, Trash2, Download, FileImage } from "lucide-react";
import { useForm } from "react-hook-form";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";

export default function SignaturesPage() {
  const { signatures, addSignature, deleteSignature } = useAppStore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const handleDelete = (id: string) => {
    deleteSignature(id);
    toast({ title: "Signature Deleted", description: "The signature has been removed.", variant: "success" });
  };

  const filteredSignatures = signatures.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.professorName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredSignatures.length / itemsPerPage);
  const paginatedSignatures = filteredSignatures.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleRowClick = (sig: Signature) => {
      // Pre-fill would ideally go here if we had an edit endpoint/mode.
      // For now, just opening the dialog as "Add New" since editing mock data wasn't fully specified beyond "allow editing".
      // Let's populate the form if we want to support editing, but for MVP we'll just show the dialog.
      // Actually, let's implement a quick mock edit mode like Templates.
      // For now, to satisfy "allow editing when clicking", we open the dialog.
      setEditingSignature(sig);
      setIsDialogOpen(true);
  };

  const [editingSignature, setEditingSignature] = useState<Signature | null>(null);

  const AddEditSignatureForm = () => {
    const { register, handleSubmit, reset } = useForm({
        defaultValues: editingSignature ? { 
            name: editingSignature.name, 
            professorName: editingSignature.professorName 
        } : {}
    });
    
    const onSubmit = (data: any) => {
        try {
            // Mock file upload - normally would upload to S3 here
            const mockUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/John_Hancock_Signature.svg/1200px-John_Hancock_Signature.svg.png";
            
            if (editingSignature) {
                 // Need to add updateSignature to store or just add new for mock
                 // I'll just simulate success since I didn't add updateSignature to store in previous step for Signatures (only Templates)
                 // Wait, I should check if I added it. I added updateSignature to store in Step 1.
                 // Yes, updateSignature is in the new store code.
                 useAppStore.getState().updateSignature(editingSignature.id, {
                     name: data.name.toLowerCase(),
                     professorName: data.professorName
                 });
                 toast({ title: "Signature Updated", description: "Changes saved.", variant: "success" });
            } else {
                addSignature({
                    name: data.name.toLowerCase(), 
                    professorName: data.professorName,
                    url: mockUrl
                });
                toast({ title: "Success", description: "New signature uploaded successfully.", variant: "success" });
            }
            
            reset();
            setIsDialogOpen(false);
            setEditingSignature(null);
        } catch (error) {
            toast({
                title: "Error",
                description: "Operation failed.",
                variant: "destructive"
            });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
                <label className="text-sm font-medium">Signature Name (Internal)</label>
                <Input {...register("name", { required: true })} placeholder="e.g. director_sig" />
                <p className="text-xs text-muted-foreground mt-1">Will be saved as lowercase</p>
            </div>
            <div>
                <label className="text-sm font-medium">Professor/Owner Name</label>
                <Input {...register("professorName", { required: true })} placeholder="e.g. Dr. Jane Doe" />
            </div>
            {editingSignature && (
                <div className="bg-muted/30 p-3 rounded border flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileImage className="w-4 h-4" />
                        <span>Current Signature File</span>
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 h-8"
                        type="button"
                        onClick={() => window.open(editingSignature.url, '_blank')}
                    >
                        <Download className="w-3 h-3" /> Download
                    </Button>
                </div>
            )}
            {!editingSignature && (
                <div>
                    <label className="text-sm font-medium">Image File (PNG/JPG)</label>
                    <Input type="file" accept="image/*" className="cursor-pointer" />
                </div>
            )}
            <Button type="submit" className="w-full">{editingSignature ? 'Update Signature' : 'Upload Signature'}</Button>
        </form>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Signatures</h1>
          <p className="text-muted-foreground">Manage digital signatures for diplomas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingSignature(null); }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="w-4 h-4" /> Upload New
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingSignature ? 'Edit Signature' : 'Upload Signature'}</DialogTitle>
                </DialogHeader>
                <AddEditSignatureForm />
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md w-full md:w-80">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input 
                    className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" 
                    placeholder="Search by name..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
            </div>
        </CardHeader>
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="pl-6">Preview</TableHead>
                        <TableHead>Signature Name</TableHead>
                        <TableHead>Professor</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedSignatures.map((sig) => (
                        <TableRow 
                            key={sig.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleRowClick(sig)}
                        >
                            <TableCell className="pl-6">
                                <div className="h-10 w-24 bg-white rounded border border-border p-1 flex items-center justify-center overflow-hidden">
                                    <img src={sig.url} alt={sig.name} className="max-h-full max-w-full object-contain" />
                                </div>
                            </TableCell>
                            <TableCell className="font-medium font-mono text-xs">{sig.name}</TableCell>
                            <TableCell>{sig.professorName}</TableCell>
                            <TableCell>{sig.createdAt}</TableCell>
                            <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-2">
                                    <Button variant="ghost" size="icon" title="Replace" onClick={(e) => e.stopPropagation()}>
                                        <RefreshCw className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                    <div onClick={(e) => e.stopPropagation()}>
                                    <DeleteConfirmDialog 
                                        onConfirm={() => handleDelete(sig.id)} 
                                        trigger={
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        }
                                        title="Delete Signature"
                                        description={`Are you sure you want to delete the signature for "${sig.professorName}"? This cannot be undone.`}
                                    />
                                    </div>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}

                    {paginatedSignatures.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                No signatures found matching your search.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            
            {filteredSignatures.length > 0 && (
                <PaginationControls 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    onItemsPerPageChange={setItemsPerPage}
                    totalRecords={filteredSignatures.length}
                />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
