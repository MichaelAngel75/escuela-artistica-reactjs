import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Download, FileImage } from "lucide-react";
import { useForm } from "react-hook-form";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

type DbSignature = {
  id: number | string;
  name: string;
  professorName: string;
  url: string; // CloudFront URL to image
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
  if (res.status === 401) {
    // Optional: hard redirect on auth loss
    // window.location.href = "/login";
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export default function SignaturesPage() {
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [editingSignature, setEditingSignature] = useState<DbSignature | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const signaturesQuery = useQuery<DbSignature[]>({
    queryKey: ["signatures"],
    queryFn: () => apiJson<DbSignature[]>("/api/signatures"),
    staleTime: 0,
  });

  const signatures = signaturesQuery.data ?? [];

  const filtered = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return signatures;
    return signatures.filter((x) =>
      x.name.toLowerCase().includes(s) ||
      x.professorName.toLowerCase().includes(s)
    );
  }, [signatures, searchTerm]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ---- Mutations ----

  // Create signature (metadata + file) -> new endpoint
  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; professorName: string; file: File }) => {
      const fd = new FormData();
      fd.append("name", payload.name);
      fd.append("professorName", payload.professorName);
      fd.append("file", payload.file);

      const res = await fetch("/api/signatures/file", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to create signature");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      toast({ title: "Signature Uploaded", description: "Signature stored in S3 and DB.", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to upload signature", variant: "destructive" });
    },
  });

  // Update signature metadata (name/professorName) -> existing PATCH
  const updateMetaMutation = useMutation({
    mutationFn: async (payload: { id: number; name?: string; professorName?: string; file?: File }) => {
        const fd = new FormData();
        if (payload.name !== undefined) fd.append("name", payload.name);
        if (payload.professorName !== undefined) fd.append("professorName", payload.professorName);
        if (payload.file) fd.append("file", payload.file);
  
        const res = await fetch(`/api/signatures/${payload.id}`, {
          method: "PATCH",
          credentials: "include",
          body: fd,
        });
  
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || "Failed to update Signature");
        }
        return res.json();
    },    
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      toast({ title: "Signature Updated", description: "Signature details updated.", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update signature", variant: "destructive" });
    },
  });

  // Replace image file -> new endpoint (backend should delete old S3 image)
//   const replaceFileMutation = useMutation({
//     mutationFn: async (payload: { id: string | number; file: File }) => {
//       const fd = new FormData();
//       fd.append("file", payload.file);

//       const res = await fetch(`/api/signatures/${payload.id}/file`, {
//         method: "PATCH",
//         credentials: "include",
//         body: fd,
//       });

//       if (!res.ok) {
//         const body = await res.json().catch(() => ({}));
//         throw new Error(body?.message || "Failed to replace signature image");
//       }
//       return res.json();
//     },
//     onSuccess: async () => {
//       await queryClient.invalidateQueries({ queryKey: ["signatures"] });
//       toast({ title: "Signature Image Replaced", description: "Old image removed from S3 and DB updated.", variant: "success" });
//     },
//     onError: (err: any) => {
//       toast({ title: "Error", description: err?.message || "Failed to replace image", variant: "destructive" });
//     },
//   });

  const deleteMutation = useMutation({
    mutationFn: async (id: string | number) => {
      return apiJson(`/api/signatures/${id}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
      toast({ title: "Signature Deleted", description: "Removed from S3 and DB.", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to delete signature", variant: "destructive" });
    },
  });

  // ---- UI Handlers ----

  const handleRowClick = (sig: DbSignature) => {
    setEditingSignature(sig);
    setIsDialogOpen(true);
  };

  const AddEditSignatureForm = () => {
    const { register, handleSubmit, reset, setValue, watch } = useForm<{
      name: string;
      professorName: string;
      file?: FileList;
    }>({
      defaultValues: editingSignature
        ? { name: editingSignature.name, professorName: editingSignature.professorName }
        : { name: "", professorName: "" },
    });

    const onSubmit = async (data: { name: string; professorName: string; file?: FileList }) => {
      const name = data.name.trim();
      const professorName = data.professorName.trim();
      const file = data.file?.[0];

      try {
        if (!name) throw new Error("Signature name is required");
        if (!professorName) throw new Error("Professor/Owner name is required");

        if (!editingSignature) {
          if (!file) throw new Error("Image file is required");
          if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
          await createMutation.mutateAsync({ name: name.toLowerCase(), professorName, file });
        } else {
            await updateMetaMutation.mutateAsync({
                id: editingSignature.id,
                name: name.toLowerCase(),
                professorName,
                file
            });
        //   // update metadata (always)
        //   await updateMetaMutation.mutateAsync({
        //     id: editingSignature.id,
        //     name: name.toLowerCase(),
        //     professorName,
        //   });

        //   // replace image (optional)
        //   if (file) {
        //     if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
        //     await replaceFileMutation.mutateAsync({ id: editingSignature.id, file });
        //   }
        }

        reset();
        setValue("file", undefined);
        setEditingSignature(null);
        setIsDialogOpen(false);
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Operation failed", variant: "destructive" });
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
        <div>
          <label className="text-sm font-medium">
            {editingSignature ? "Replace Image (optional)" : "Image File (required)"}
          </label>
          <Input type="file" accept="image/*" className="cursor-pointer" {...register("file")} />
        </div>

        {editingSignature?.url && (
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
              onClick={() => window.open(editingSignature.url, "_blank")}
            >
              <Download className="w-3 h-3" /> Open
            </Button>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={
            createMutation.isPending ||
            updateMetaMutation.isPending 
            //  || replaceFileMutation.isPending
          }
        >
          {editingSignature ? "Guardar" : "Cargar Firma"}
        </Button>
      </form>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Firmas</h1>
          <p className="text-muted-foreground">Gestionar firmas digitales para diplomas</p>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingSignature(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Cargar Nuevo
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSignature ? "Editar Firma" : "Cargar Firma"}</DialogTitle>
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
              placeholder="Buscar por Profesor..."
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
                <TableHead className="pl-6">Prevista</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Profesor</TableHead>
                <TableHead>Actualizado</TableHead>
                <TableHead className="text-right pr-6">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginated.map((sig) => (
                <TableRow
                  key={String(sig.id)}
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

                  <TableCell>{toDateString(sig.updatedAt ?? sig.createdAt)}</TableCell>

                  <TableCell className="text-right pr-6">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Open"
                        onClick={() => window.open(sig.url, "_blank")}
                      >
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </Button>

                      <DeleteConfirmDialog
                        onConfirm={() => deleteMutation.mutate(sig.id)}
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
                        title="Delete Signature"
                        description={`Are you sure you want to delete "${sig.name}"? This removes it from S3 and Postgres.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {signaturesQuery.isLoading ? "Loading..." : "No signatures found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {filtered.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={setItemsPerPage}
              totalRecords={filtered.length}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
