import { useAppStore, DiplomaBatch } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import { FileUp, CheckCircle, AlertCircle, Download, Loader2, Search, FileSpreadsheet, Clock } from "lucide-react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/shared/PaginationControls";

// --------------------------------------------------------
// ------- Examples of CSV file -------------
// Estudiante,Taller,Fecha,Profesor
// Karen Aguilar Salazar,Edición fotográfica y líneas editoriales ,noviembre de 2024,Fernando Villa
// Edwin Arturo Casas Rueda,Edición fotográfica y líneas editoriales ,noviembre de 2024,Fernando Villa
// Nelson Cruz Trejo,Edición fotográfica y líneas editoriales ,noviembre de 2024,Fernando Villa

interface ProcessedRecord {
    firstName: string;
    lastName: string;
    course: string;
    signature: string;
    professor: string;
    status: 'pending' | 'done' | 'error';
    message?: string;
}

export default function GeneratePage() {
  const { templates, diplomaBatches, addDiplomaBatch, updateDiplomaBatchStatus } = useAppStore();
  const { toast } = useToast();
  
  const [view, setView] = useState<'upload' | 'processing' | 'history'>('history');
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ProcessedRecord[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);

  // History Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [searchTerm, setSearchTerm] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.[0]) {
        setFile(acceptedFiles[0]);
        parseCSV(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1
  });

  const parseCSV = (file: File) => {
    Papa.parse(file, {
        header: true,
        complete: (results) => {
            const parsedData = results.data.map((row: any) => ({
                firstName: row['First Name'] || row['first_name'] || 'Unknown',
                lastName: row['Last Name'] || row['last_name'] || 'Unknown',
                course: row['Course'] || row['course_name'] || 'Unknown Course',
                signature: row['Signature'] || row['signature_file'] || 'default.png',
                professor: row['Professor'] || row['professor_name'] || 'Unknown Prof',
                status: 'pending' as const
            })).filter(r => r.firstName !== 'Unknown'); 
            
            setRecords(parsedData);
            toast({ 
                title: "CSV Parsed", 
                description: `Found ${parsedData.length} records ready.`,
                variant: "success"
            });
        },
        error: (err) => {
            toast({ title: "Error", description: "Failed to parse CSV file.", variant: "destructive" });
        }
    });
  };

  const startProcessing = () => {
      if (records.length === 0 || !file) return;
      
      // Create Batch
      const newBatchId = Math.random().toString(36).substr(2, 9);
      addDiplomaBatch({
          fileName: file.name,
          status: 'processing',
          totalRecords: records.length
      });
      setCurrentBatchId(newBatchId);
      
      setView('processing');
      setProgress(0);

      // Mock processing simulation
      // Go to history immediately
      setView('history');
      toast({ title: "Batch Started", description: "Processing started in background...", variant: "default" });
      
      let current = 0;
      const total = records.length;
      
      // Simulate background processing updating the store
      const interval = setInterval(() => {
          current += 1;
          // No local progress state needed for view if we are in history, 
          // but we could update the batch status in store if we had a progress field in batch.
          // For now just wait for completion.
          
          if (current >= total) {
              clearInterval(interval);
              
              const hasErrors = Math.random() > 0.8;
              if (hasErrors) {
                  updateDiplomaBatchStatus(newBatchId, 'failed');
                  toast({ title: "Processing Failed", description: "Batch generation encountered errors.", variant: "destructive" });
              } else {
                  updateDiplomaBatchStatus(newBatchId, 'completed', '#mock-zip-url');
                  toast({ title: "Processing Complete", description: "Batch #"+newBatchId+" ready for download.", variant: "success" });
              }
              
              // Reset local state
              setFile(null);
              setRecords([]);
              setCurrentBatchId(null);
          }
      }, 50); 
  };

  const activeTemplate = templates.find(t => t.status === 'active');

  // History Table Logic
  const filteredBatches = diplomaBatches.filter(b => 
      b.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(filteredBatches.length / itemsPerPage);
  const paginatedBatches = filteredBatches.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
  );

  if (view === 'history') {
      return (
        <div className="space-y-6">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-serif font-bold text-primary">Diploma Batches</h1>
                    <p className="text-muted-foreground">History of generated certificates</p>
                </div>
                <Button onClick={() => setView('upload')} className="gap-2">
                    <FileUp className="w-4 h-4" /> New Batch
                </Button>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md w-full md:w-80">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <input 
                            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" 
                            placeholder="Search by filename..." 
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-6">File Name</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Records</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right pr-6">Download</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedBatches.map((batch) => (
                                <TableRow key={batch.id}>
                                    <TableCell className="pl-6 font-medium flex items-center gap-2">
                                        <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                                        {batch.fileName}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                            <Clock className="w-3 h-3" />
                                            {new Date(batch.createdAt).toLocaleString()}
                                        </div>
                                    </TableCell>
                                    <TableCell>{batch.totalRecords}</TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant={batch.status === 'completed' ? 'default' : batch.status === 'failed' ? 'destructive' : 'secondary'}
                                            className={batch.status === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                        >
                                            {batch.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        {batch.status === 'completed' && batch.zipUrl && (
                                            <Button size="sm" variant="outline" className="gap-2 h-8">
                                                <Download className="w-3 h-3" /> ZIP
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {paginatedBatches.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No batches found.
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-serif font-bold text-primary">Generate Diplomas</h1>
        <p className="text-muted-foreground">Batch process certificates from CSV data</p>
      </div>

      {!activeTemplate && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 flex items-center gap-3 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <p>No active template selected. Please go to Templates and activate one first.</p>
          </div>
      )}

      {view === 'upload' && (
        <Card className="border-dashed border-2 shadow-none">
            <CardContent className="pt-6">
                <div 
                    {...getRootProps()} 
                    className={`
                        flex flex-col items-center justify-center h-64 rounded-lg cursor-pointer transition-colors
                        ${isDragActive ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'}
                    `}
                >
                    <input {...getInputProps()} />
                    <div className="bg-primary/10 p-4 rounded-full mb-4">
                        <FileUp className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-lg font-medium mb-2">
                        {file ? file.name : "Drop CSV file here or click to upload"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Required columns: First Name, Last Name, Course, Signature, Professor
                    </p>
                </div>

                <div className="mt-6 flex justify-between">
                     <Button variant="ghost" onClick={() => setView('history')}>Cancel</Button>
                     {records.length > 0 && (
                        <Button onClick={startProcessing} disabled={!activeTemplate}>
                            Start Generation ({records.length} records)
                        </Button>
                     )}
                </div>
            </CardContent>
        </Card>
      )}

      {view === 'processing' && (
          <Card>
              <CardHeader>
                  <CardTitle>Processing Batch...</CardTitle>
                  <CardDescription>Generating PDFs using template: {activeTemplate?.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                  <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                          <span>Progress</span>
                          <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                  </div>
                  
                  <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
              </CardContent>
          </Card>
      )}
    </div>
  );
}
