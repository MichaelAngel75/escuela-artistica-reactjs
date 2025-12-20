import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useMemo, useState } from "react";
import { FileUp, Download, Search, FileSpreadsheet, Clock, Loader2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

type DbBatchStatus = "recibido" | "processing" | "completed" | "failed"; // align with your enum

type DbDiplomaBatch = {
  id: number;
  fileName: string;
  csvUrl?: string | null;
  status: DbBatchStatus;
  totalRecords: number;
  zipUrl?: string | null;
  createdBy?: string | null;
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

export default function GeneratePage() {
  const { toast } = useToast();

  const [view, setView] = useState<"history" | "upload">("history");
  const [file, setFile] = useState<File | null>(null);

  // History Pagination + Search
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState("");

  // -------------------------------------------------------------------
  // ---- to include the filename with a link to download
  const shortName = (name: string) => {
    if (!name) return "";
    if (name.length <= 34) return name;
    return `${name.slice(0, 16)}…${name.slice(-14)}`;
  };
  const downloadCsv = async (batch: DbDiplomaBatch) => {
    if (!batch.csvUrl) {
      toast({
        title: "CSV no disponible",
        description: "Este proceso no tiene csvUrl guardado aún.",
        variant: "destructive",
      });
      return;
    }
  
    // ----------------------------------------------------------------
    // If your csvUrl is already a CloudFront/public URL, this is enough:
    window.open(batch.csvUrl, "_blank");
  };


  // Always refetch when landing here
  const batchesQuery = useQuery<DbDiplomaBatch[]>({
    queryKey: ["diploma-batches"],
    queryFn: () => apiJson<DbDiplomaBatch[]>("/api/diploma-batches"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const batches = batchesQuery.data ?? [];

  const filteredBatches = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return batches;
    return batches.filter((b) => (b.fileName ?? "").toLowerCase().includes(s));
  }, [batches, searchTerm]);

  const totalPages = Math.ceil(filteredBatches.length / itemsPerPage) || 1;
  const paginatedBatches = filteredBatches.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const uploadMutation = useMutation({
    mutationFn: async (payload: { file: File }) => {
      const fd = new FormData();
      fd.append("file", payload.file);

      const res = await fetch("/api/diploma-batches", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to start batch");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["diploma-batches"] });
      toast({
        title: "Proceso enviado",
        description: "CSV subido y mensaje enviado a SQS. El procesamiento se ejecuta en background.",
        variant: "success",
      });
      setFile(null);
      setView("history");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Upload failed", variant: "destructive" });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles?.[0] ?? null;
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
  });

  const startProcessing = async () => {
    if (!file) return;
    await uploadMutation.mutateAsync({ file });
  };

  if (view === "history") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-primary">Diplomas Generados</h1>
            <p className="text-muted-foreground">Histórico de procesos</p>
          </div>
          <Button onClick={() => setView("upload")} className="gap-2">
            <FileUp className="w-4 h-4" /> Nuevo Proceso
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md w-full md:w-80">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
                placeholder="Buscar por CSV..."
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
                  <TableHead className="pl-6">Archivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Conteo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right pr-6">Descargar</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="pl-6 font-medium">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />

                        {batch.csvUrl ? (
                        <button
                            type="button"
                            className="text-left underline underline-offset-4 hover:text-primary transition-colors"
                            title={batch.fileName}
                            onClick={() => downloadCsv(batch)}
                        >
                            {shortName(batch.fileName)}
                        </button>
                        ) : (
                        <span title={batch.fileName}>{shortName(batch.fileName)}</span>
                        )}
                    </div>

                    {batch.csvUrl && (
                        <div className="text-[11px] text-muted-foreground mt-1">
                        Click para descargar el CSV
                        </div>
                    )}
                    </TableCell>                    
                    {/* <TableCell className="pl-6 font-medium flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                      {batch.fileName}
                    </TableCell> */}


                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Clock className="w-3 h-3" />
                        {toDateString(batch.createdAt)}
                      </div>
                    </TableCell>

                    <TableCell>{batch.totalRecords}</TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          batch.status === "completed"
                            ? "default"
                            : batch.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                        className={batch.status === "completed" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                      >
                        {batch.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right pr-6">
                      {batch.zipUrl ? (
                        <Button size="sm" variant="outline" className="gap-2 h-8" onClick={() => window.open(batch.zipUrl!, "_blank")}>
                          <Download className="w-3 h-3" /> ZIP
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {batch.status === "completed" ? "No ZIP" : "-"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {paginatedBatches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {batchesQuery.isLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                        </span>
                      ) : (
                        "No batches found."
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {filteredBatches.length > 0 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={setItemsPerPage}
                totalRecords={filteredBatches.length}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Upload view
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-serif font-bold text-primary">Generar Diplomas</h1>
        <p className="text-muted-foreground">Sube un CSV para iniciar un proceso (S3 + DB + SQS)</p>
      </div>

      <Card className="border-dashed border-2 shadow-none">
        <CardContent className="pt-6">
          <div
            {...getRootProps()}
            className={`
              flex flex-col items-center justify-center h-64 rounded-lg cursor-pointer transition-colors
              ${isDragActive ? "bg-primary/5 border-primary" : "hover:bg-muted/50"}
            `}
          >
            <input {...getInputProps()} />
            <div className="bg-primary/10 p-4 rounded-full mb-4">
              <FileUp className="w-8 h-8 text-primary" />
            </div>

            <p className="text-lg font-medium mb-2">
              {file ? file.name : "Drop CSV file here or click to upload"}
            </p>
            <p className="text-sm text-muted-foreground">Se guardará en S3 y se enviará un mensaje a SQS.</p>
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setView("history")}>
              Cancelar
            </Button>
            <Button onClick={startProcessing} disabled={!file || uploadMutation.isPending}>
              {uploadMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                </span>
              ) : (
                "Iniciar Proceso"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
