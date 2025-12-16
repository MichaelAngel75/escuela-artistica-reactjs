import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw } from "lucide-react";
import { apiFetchJson } from "@/lib/apiFetch";

interface FieldConfig {
  id: string;
  label: string;
  x: number;
  y: number;
  fontSize: number;
}

// This matches the JSONB structure in configuration_diploma.field_mappings
interface ApiConfiguration {
  fieldMappings: Record<
    string,
    {
      x: number;
      y: number;
      fontSize?: number;
      label?: string;
    }
  >;
}

// Default layout used if no config is found in DB
const DEFAULT_FIELDS: FieldConfig[] = [
  { id: "studentName", label: "Nombre estudiante", x: 150, y: 280, fontSize: 24 },
  { id: "course", label: "Nombre Curso", x: 200, y: 400, fontSize: 18 },
  { id: "professor", label: "Nombre profesor", x: 200, y: 500, fontSize: 16 },
  { id: "signature", label: "Firma", x: 200, y: 600, fontSize: 0 }, // 0 = image only
];

export default function ConfigurationPage() {
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldConfig[]>(DEFAULT_FIELDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ---- Helpers to map API <-> UI ----

  const mapFromApi = (apiConfig: ApiConfiguration | null): FieldConfig[] => {
    if (!apiConfig || !apiConfig.fieldMappings) {
      return DEFAULT_FIELDS;
    }

    const result: FieldConfig[] = [];

    for (const def of DEFAULT_FIELDS) {
      const apiField = apiConfig.fieldMappings[def.id];

      if (apiField) {
        result.push({
          id: def.id,
          label: apiField.label ?? def.label,
          x: apiField.x ?? def.x,
          y: apiField.y ?? def.y,
          fontSize: def.id === "signature"
            ? 0
            : apiField.fontSize ?? def.fontSize,
        });
      } else {
        // If backend doesn't have this field yet, fallback to default
        result.push(def);
      }
    }

    return result;
  };

  const mapToApi = (fields: FieldConfig[]): ApiConfiguration["fieldMappings"] => {
    const mappings: ApiConfiguration["fieldMappings"] = {};

    for (const f of fields) {
      mappings[f.id] = {
        x: f.x,
        y: f.y,
        ...(f.id !== "signature" ? { fontSize: f.fontSize } : {}),
        label: f.label,
      };
    }

    return mappings;
  };

  // ---- Load configuration from backend on mount ----
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await apiFetchJson<ApiConfiguration | null>(
          "/api/configuration",
        );
    
        setFields(mapFromApi(data));
    
        toast({
          title: "Configuration loaded",
          description: "Using saved diploma layout.",
          variant: "success", // 🟢
        });
      } catch (error) {
        console.error(error);
    
        toast({
          title: "Failed to load configuration",
          description: "Using default layout instead.",
          variant: "destructive", // 🔴
        });
      } finally {
        setLoading(false);
      }      
    };    

    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Handlers ----

  const handleChange = (id: string, key: keyof FieldConfig, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [key]: numValue } : f)),
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const fieldMappings = mapToApi(fields);
      await apiFetchJson("/api/configuration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldMappings }),
      });
  
      toast({
        title: "Saved successfully",
        description: "Diploma configuration updated.",
        variant: "success", // 🟢
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Please try again.",
        variant: "destructive", // 🔴
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFields(DEFAULT_FIELDS);
    toast({
      title: "Resetear defaults",
      description: "Layout positions restored (not yet saved).",
      variant: "success",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-10">
        <h1 className="text-2xl font-serif font-bold text-primary">
          Diploma Configuration
        </h1>
        <p className="text-muted-foreground">Cargando configuracion…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">
            Diploma Configuration
          </h1>
          <p className="text-muted-foreground">
            Define precise positioning for dynamic fields
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button onClick={handleSave} className="gap-2" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          {fields.map((field) => (
            <Card key={field.id}>
              <CardHeader className="py-3">
                <CardTitle className="text-base font-medium">
                  {field.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 pb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    X Position (px)
                  </label>
                  <Input
                    type="number"
                    value={field.x}
                    onChange={(e) =>
                      handleChange(field.id, "x", e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Y Position (px)
                  </label>
                  <Input
                    type="number"
                    value={field.y}
                    onChange={(e) =>
                      handleChange(field.id, "y", e.target.value)
                    }
                  />
                </div>
                {field.id !== "signature" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Font Size (pt)
                    </label>
                    <Input
                      type="number"
                      value={field.fontSize}
                      onChange={(e) =>
                        handleChange(field.id, "fontSize", e.target.value)
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Visual Preview Mockup */}
        <Card className="h-fit sticky top-8 border-primary/20 bg-paper">
          <CardHeader>
            <CardTitle>Prevista Visual</CardTitle>
            <CardDescription>
            Visualización aproximada del diseño
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="aspect-[1.414] bg-white border border-border shadow-sm relative overflow-hidden w-full max-w-md mx-auto">
              {/* Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none opacity-10">
                <div className="border-r border-black" />
                <div className="border-r border-black" />
                <div className="border-r border-black" />
                <div className="border-r border-black" />
              </div>

              {fields.map((field) => (
                <div
                  key={field.id}
                  className="absolute border border-dashed border-primary/50 bg-primary/5 text-primary px-2 flex items-center justify-center whitespace-nowrap transition-all duration-300"
                  style={{
                    left: `${(field.x / 800) * 100}%`,
                    top: `${(field.y / 600) * 100}%`,
                    fontSize:
                      field.id === "signature"
                        ? "12px"
                        : `${field.fontSize / 2}px`, // Scale down for preview
                    transform: "translate(-50%, -50%)",
                    width: field.id === "signature" ? "100px" : "auto",
                    height: field.id === "signature" ? "40px" : "auto",
                  }}
                >
                  {field.id === "signature" ? "[Signature]" : `{${field.label}}`}
                </div>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">
             La vista previa está escalada. El resultado real depende del motor de generación de PDF.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
