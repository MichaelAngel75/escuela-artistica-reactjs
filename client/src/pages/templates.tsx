import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { Plus, Search, Eye, FileText, Trash2, Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

type DbTemplate = {
  id: number;
  name: string;
  url: string; // stored as s3://bucket/key
  status: "Active" | "Inactive";
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

function toDateString(v: any) {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toLocaleString();
  return String(v);
}

async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export default function TemplatesPage() {
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<DbTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<DbTemplate | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const templatesQuery = useQuery<DbTemplate[]>({
    queryKey: ["templates"],
    queryFn: () => apiJson<DbTemplate[]>("/api/templates"),
    staleTime: 0,
  });

  const templates = templatesQuery.data ?? [];

  const filteredTemplates = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter(t => t.name.toLowerCase().includes(s));
  }, [templates, searchTerm]);

  const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const presignMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiJson<{ url: string }>(`/api/templates/${id}/presign`);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; file: File }) => {
      const fd = new FormData();
      fd.append("name", payload.name);
      fd.append("file", payload.file);

      const res = await fetch("/api/templates", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to upload template");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Template Uploaded", description: "New template stored in S3 and DB.", variant: "success" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number; name?: string; file?: File }) => {
      const fd = new FormData();
      if (payload.name !== undefined) fd.append("name", payload.name);
      if (payload.file) fd.append("file", payload.file);

      const res = await fetch(`/api/templates/${payload.id}`, {
        method: "PATCH",
        credentials: "include",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to update template");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Template Updated", description: "Template updated in S3 and/or DB.", variant: "success" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiJson(`/api/templates/${id}/activate`, { 
        method: "POST",
        credentials: "include" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Status Updated", description: "Only one template is now Active.", variant: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiJson(`/api/templates/${id}`, { 
        method: "DELETE",
        credentials: "include" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Template Deleted", description: "Removed from S3 and DB.", variant: "success" });
    },
  });

  const handleRowClick = (template: DbTemplate) => {
    setEditingTemplate(template);
    setIsDialogOpen(true);
  };

  const handleView = async (template: DbTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTemplate(template);
    setIsViewDialogOpen(true);
  };

  const handleDownload = async (template: DbTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { url } = await presignMutation.mutateAsync(template.id);
      window.open(url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to download", variant: "destructive" });
    }
  };

  const AddEditTemplateForm = () => {
    const { register, handleSubmit, reset, setValue } = useForm<{ name: string; file?: FileList }>({
      defaultValues: editingTemplate ? { name: editingTemplate.name } : { name: "" },
    });

    const onSubmit = async (data: { name: string; file?: FileList }) => {
      try {
        const name = data.name.trim();
        if (!name) throw new Error("Template name is required");

        const file = data.file?.[0];

        if (editingTemplate) {
          // name required, file optional
          await updateMutation.mutateAsync({ id: editingTemplate.id, name, file });
        } else {
          if (!file) throw new Error("PDF file is required");
          if (file.type !== "application/pdf") throw new Error("Only PDF files are allowed");
          await createMutation.mutateAsync({ name, file });
        }

        reset();
        setValue("file", undefined);
        setEditingTemplate(null);
        setIsDialogOpen(false);
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Operation failed", variant: "destructive" });
      }
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium">Template Name</label>
          <Input {...register("name", { required: true })} placeholder="e.g. Annual Diploma 2025" />
        </div>

        <div>
          <label className="text-sm font-medium">
            {editingTemplate ? "Replace Layout File (PDF) (optional)" : "Layout File (PDF)"}
          </label>
          <Input type="file" accept="application/pdf,.pdf" className="cursor-pointer" {...register("file")} />
          <p className="text-xs text-muted-foreground mt-1">Only .pdf files are allowed</p>
        </div>

        {editingTemplate && (
          <div className="bg-muted/30 p-3 rounded border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>Current PDF</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8"
              type="button"
              onClick={(e) => handleDownload(editingTemplate, e as any)}
            >
              <Download className="w-3 h-3" /> Download
            </Button>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
          {editingTemplate ? "Update Template" : "Upload Template"}
        </Button>
      </form>
    );
  };

  const activeCount = templates.filter(t => t.status === "Active").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Templates</h1>
          <p className="text-muted-foreground">
            Manage diploma PDF layouts (stored in S3 + tracked in Postgres). Active templates: {activeCount}
          </p>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingTemplate(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Upload Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Template" : "Upload New Layout"}</DialogTitle>
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

            <div className="flex-1 h-full bg-muted/20 rounded-md border overflow-hidden">
              {selectedTemplate ? (
                <TemplatePreview templateId={selectedTemplate.id} />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No template selected
                </div>
              )}
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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
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
                      variant={t.status === "Active" ? "default" : "secondary"}
                      className={t.status === "Active" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    >
                      {t.status}
                    </Badge>
                  </TableCell>

                  <TableCell>{toDateString(t.createdAt)}</TableCell>

                  <TableCell className="text-right pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={(e) => handleView(t, e)} title="Preview">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </Button>

                      <Button variant="ghost" size="icon" onClick={(e) => handleDownload(t, e)} title="Download">
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </Button>

                      {t.status !== "Active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            activateMutation.mutate(t.id);
                          }}
                          className="h-8 text-xs"
                          disabled={activateMutation.isPending}
                        >
                          Set Active
                        </Button>
                      )}

                      <div onClick={(e) => e.stopPropagation()}>
                        <DeleteConfirmDialog
                          onConfirm={() => deleteMutation.mutate(t.id)}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Template"
                          description={`Are you sure you want to delete "${t.name}"? This removes it from S3 and Postgres.`}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {paginatedTemplates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {templatesQuery.isLoading ? "Loading..." : "No templates found."}
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

function TemplatePreview({ templateId }: { templateId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["templates", templateId, "presign"],
    queryFn: () => apiJson<{ url: string }>(`/api/templates/${templateId}/presign`),
    staleTime: 0,
    retry: false,
  });

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading preview…</div>;
  }

  if (isError || !data?.url) {
    return <div className="h-full flex items-center justify-center text-destructive text-sm">Failed to load preview</div>;
  }

  return <iframe src={data.url} className="w-full h-full" title="PDF Preview" />;
}
