import { useAppStore, Template } from "@/lib/store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, Search, Eye, FileText, Trash2, Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";

export default function TemplatesPage() {
  const { templates, addTemplate, deleteTemplate, updateTemplate, toggleTemplateStatus } = useAppStore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTemplate(id);
    toast({ title: "Template Deleted", description: "The template has been removed.", variant: "success" });
  };

  const handleToggleStatus = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTemplateStatus(id);
    toast({ title: "Status Updated", description: "Template status has been changed.", variant: "success" });
  };
  
  const handleRowClick = (template: Template) => {
      setEditingTemplate(template);
      setIsDialogOpen(true);
  };

  const handleView = (template: Template, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedTemplate(template);
      setIsViewDialogOpen(true);
  };

  const AddEditTemplateForm = () => {
    const { register, handleSubmit, reset } = useForm({
        defaultValues: editingTemplate ? { name: editingTemplate.name } : {}
    });
    
    const onSubmit = (data: any) => {
        try {
            if (editingTemplate) {
                updateTemplate(editingTemplate.id, { name: data.name });
                toast({ title: "Template Updated", description: "Template details updated successfully.", variant: "success" });
            } else {
                 // Mock file upload - forcing PDF icon/thumb
                const mockUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"; // Valid dummy PDF URL for viewing
                
                addTemplate({
                    name: data.name,
                    thumbnailUrl: mockUrl,
                    status: 'inactive'
                });
                toast({ title: "Template Added", description: "New template uploaded successfully.", variant: "success" });
            }
            reset();
            setEditingTemplate(null);
            setIsDialogOpen(false);
        } catch (e) {
            toast({ title: "Error", description: "Operation failed", variant: "destructive" });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
                <label className="text-sm font-medium">Template Name</label>
                <Input {...register("name", { required: true })} placeholder="e.g. Annual Diploma 2025" />
            </div>
            {editingTemplate && (
                <div className="bg-muted/30 p-3 rounded border flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span>Current Layout File</span>
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 h-8"
                        type="button"
                        onClick={() => window.open(editingTemplate.thumbnailUrl, '_blank')}
                    >
                        <Download className="w-3 h-3" /> Download
                    </Button>
                </div>
            )}
            {!editingTemplate && (
                <div>
                    <label className="text-sm font-medium">Layout File (PDF)</label>
                    <Input type="file" accept=".pdf" className="cursor-pointer" />
                    <p className="text-xs text-muted-foreground mt-1">Only .pdf files are allowed</p>
                </div>
            )}
            <Button type="submit" className="w-full">{editingTemplate ? 'Update Template' : 'Upload Template'}</Button>
        </form>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Templates</h1>
          <p className="text-muted-foreground">Manage diploma PDF layouts</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if(!open) setEditingTemplate(null); }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="w-4 h-4" /> Upload Template
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingTemplate ? 'Edit Template' : 'Upload New Layout'}</DialogTitle>
                </DialogHeader>
                <AddEditTemplateForm />
            </DialogContent>
        </Dialog>
        
        {/* View PDF Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            <DialogContent className="max-w-4xl h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Preview: {selectedTemplate?.name}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 h-full bg-muted/20 rounded-md border flex items-center justify-center">
                    {/* Mock PDF Viewer */}
                    <iframe src={selectedTemplate?.thumbnailUrl} className="w-full h-full" title="PDF Preview" />
                </div>
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md w-full md:w-80">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input 
                    className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" 
                    placeholder="Search templates..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
            </div>
        </CardHeader>
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="pl-6">Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedTemplates.map((t) => (
                        <TableRow 
                            key={t.id} 
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleRowClick(t)}
                        >
                            <TableCell className="pl-6">
                                <div className="h-10 w-10 bg-red-100 rounded flex items-center justify-center">
                                    <FileText className="text-red-600 w-6 h-6" />
                                </div>
                            </TableCell>
                            <TableCell className="font-medium">{t.name}</TableCell>
                            <TableCell>
                                <Badge 
                                    variant={t.status === 'active' ? 'default' : 'secondary'}
                                    className={t.status === 'active' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                >
                                    {t.status}
                                </Badge>
                            </TableCell>
                            <TableCell>{t.createdAt}</TableCell>
                            <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-2">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={(e) => handleView(t, e)}
                                        title="View PDF"
                                    >
                                        <Eye className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                    
                                    {t.status === 'inactive' && (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={(e) => handleToggleStatus(t.id, e)}
                                            className="h-8 text-xs"
                                        >
                                            Set Active
                                        </Button>
                                    )}
            <div onClick={(e) => e.stopPropagation()}>
                                    <DeleteConfirmDialog 
                                        onConfirm={() => deleteTemplate(t.id)} 
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        }
                                        title="Delete Template"
                                        description={`Are you sure you want to delete "${t.name}"?`}
                                    />
                                    </div>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {paginatedTemplates.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                No templates found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            
            {filteredTemplates.length > 0 && (
                <PaginationControls 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    onItemsPerPageChange={setItemsPerPage}
                    totalRecords={filteredTemplates.length}
                />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
