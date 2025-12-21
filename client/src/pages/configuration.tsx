import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  defaultFieldMappings,
  AVAILABLE_FONTS,
  type FieldMappings,
  type FontConfig,
} from "@shared/schema";
import { Save, RotateCcw, User, GraduationCap, PenTool, Calendar, UserCircle, AlertCircle } from "lucide-react";


// --- title collapsable different colors styles:
function sectionHeaderClasses(section: "estudiante" | "curso" | "profesor-signature" | "profesor" | "fecha") {
  // Subtle tinted backgrounds + border that work in light/dark
  const base =
    "px-4 py-3 hover:no-underline rounded-t-lg border-b " +
    "transition-colors data-[state=open]:rounded-b-none " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const map: Record<typeof section, string> = {
    estudiante:
      "bg-violet-50/60 text-foreground border-violet-200/60 dark:bg-violet-950/25 dark:border-violet-900/40",
    curso:
      "bg-sky-50/60 text-foreground border-sky-200/60 dark:bg-sky-950/25 dark:border-sky-900/40",
    "profesor-signature":
      "bg-amber-50/60 text-foreground border-amber-200/60 dark:bg-amber-950/25 dark:border-amber-900/40",
    profesor:
    "bg-fuchsia-50/70 text-foreground border-fuchsia-200/70 dark:bg-fuchsia-950/25 dark:border-fuchsia-900/45",
    fecha:
    "bg-emerald-50/60 text-foreground border-emerald-200/60 dark:bg-emerald-950/25 dark:border-emerald-900/40",
  };
  return `${base} ${map[section]}`;
}

function sectionAccentClasses(section: "estudiante" | "curso" | "profesor-signature" | "profesor" | "fecha") {
  // Thin left accent bar (optional but nice)
  const base = "w-1.5 h-5 rounded-full";
  const map: Record<typeof section, string> = {
    estudiante: "bg-violet-400/70 dark:bg-violet-500/60",
    curso: "bg-sky-400/70 dark:bg-sky-500/60",
    "profesor-signature": "bg-amber-400/70 dark:bg-amber-500/60",
    profesor: "bg-fuchsia-500/80 dark:bg-fuchsia-400/70",
    fecha: "bg-emerald-400/70 dark:bg-emerald-500/60",  
  };
  return `${base} ${map[section]}`;
}

function sectionContentClasses(
  section: "estudiante" | "curso" | "profesor-signature" | "profesor" | "fecha",
) {
  // Lighter than header; subtle tint and soft border separation
  const base = "px-4 py-4 border-t";

  const map: Record<typeof section, string> = {
    estudiante:
      "bg-violet-50/30 border-violet-200/40 dark:bg-violet-950/10 dark:border-violet-900/30",
    curso:
      "bg-sky-50/30 border-sky-200/40 dark:bg-sky-950/10 dark:border-sky-900/30",
    "profesor-signature":
      "bg-amber-50/30 border-amber-200/40 dark:bg-amber-950/10 dark:border-amber-900/30",
    profesor:
      "bg-fuchsia-50/30 border-fuchsia-200/45 dark:bg-fuchsia-950/10 dark:border-fuchsia-900/35",
    fecha:
      "bg-emerald-50/30 border-emerald-200/40 dark:bg-emerald-950/10 dark:border-emerald-900/30",
  };

  return `${base} ${map[section]}`;
}



/// --- date previou 
const date = new Date();
const day = date.getDate();
const year = date.getFullYear();
const month = date.toLocaleString("es-ES", { month: "long" });
const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1);
const formattedToday = `${day} de ${monthCapitalized}, ${year}`;


// Preview canvas dimensions (scaled representation of PDF coordinates)
const PREVIEW_WIDTH = 612; // Standard letter width in points
const PREVIEW_HEIGHT = 792; // Standard letter height in points

// Helper to validate hex color
function isValidHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Color preview component
function ColorPreview({ color, isValid }: { color: string; isValid: boolean }) {
  return (
    <div
      className="w-5 h-5 rounded-md border border-border flex-shrink-0"
      style={{
        backgroundColor: isValid ? color : "#ffffff",
        borderColor: isValid ? color : "hsl(var(--destructive))",
      }}
      data-testid="color-preview"
    />
  );
}

// Font input group component
function FontInputGroup({
  label,
  font,
  onChange,
  fieldId,
}: {
  label: string;
  font: FontConfig;
  onChange: (font: FontConfig) => void;
  fieldId: string;
}) {
  const [localColor, setLocalColor] = useState(font.color);
  const isValidColor = isValidHex(localColor);

  useEffect(() => {
    setLocalColor(font.color);
  }, [font.color]);

  const handleColorChange = useCallback(
    (value: string) => {
      setLocalColor(value);
      if (isValidHex(value)) {
        onChange({ ...font, color: value });
      }
    },
    [font, onChange]
  );

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-muted-foreground">{label}</Label>
      
      <div className="grid grid-cols-1 gap-3">
        {/* Nombre de la Fuente */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nombre de la Fuente</Label>
          <Select
            value={font.name}
            onValueChange={(value) => onChange({ ...font, name: value })}
          >
            <SelectTrigger data-testid={`select-font-${fieldId}`}>
              <SelectValue placeholder="Select font" />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_FONTS.map((fontName) => (
                <SelectItem key={fontName} value={fontName}>
                  <span style={{ fontFamily: fontName.split("-")[0] }}>
                    {fontName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* <p className="text-xs text-muted-foreground">Python PDF compatible fonts</p> */}
        </div>

        {/* Font Size */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tamaño (8-48 pt)</Label>
          <Input
            type="number"
            min={8}
            max={48}
            value={font.size}
            onChange={(e) =>
              onChange({ ...font, size: parseInt(e.target.value) || 12 })
            }
            data-testid={`input-font-size-${fieldId}`}
          />
          {/* <p className="text-xs text-muted-foreground">Font size in points</p> */}
        </div>

        {/* Color */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Color (# Hex Number)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={localColor}
              onChange={(e) => handleColorChange(e.target.value)}
              placeholder="#000000"
              className={!isValidColor && localColor.length > 0 ? "border-destructive" : ""}
              data-testid={`input-color-${fieldId}`}
            />
            <ColorPreview color={localColor} isValid={isValidColor} />
          </div>
          {!isValidColor && localColor.length > 0 && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Invalid hex format (e.g. #FF5500)
            </p>
          )}
          {/* Ejemplo de texto – vista previa */}
          {isValidColor && (
            <div
              className="mt-2 p-3 bg-white dark:bg-gray-900 rounded-md border"
              style={{
                color: localColor,
                fontFamily: font.name.split("-")[0],
                fontSize: `${Math.min(font.size, 18)}px`,
                fontWeight: font.name.includes("Bold") ? "bold" : "normal",
                fontStyle: font.name.includes("Oblique") || font.name.includes("Italic") ? "italic" : "normal",
              }}
              data-testid={`text-preview-${fieldId}`}
            >
              Ejemplo de texto – vista previa
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Position input component
function PositionInput({
  label,
  value,
  onChange,
  testId,
  helperText,
  required = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  testId: string;
  helperText?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        data-testid={testId}
      />
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

// Loading skeleton for form
function FormSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Configuration() {
  const { toast } = useToast();
  const [config, setConfig] = useState<FieldMappings>(defaultFieldMappings);

  // // Fetch existing configuration
  // const { data: savedConfig, isLoading, isError, error } = useQuery<{ fieldMappings: FieldMappings }>({
  //   queryKey: ["/api/configuration"],
  // });

  const {
    data: savedConfig,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<{ fieldMappings: FieldMappings }>({
    queryKey: ["/api/configuration"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  

  useEffect(() => {
    if (savedConfig?.fieldMappings) {
      setConfig(savedConfig.fieldMappings);
    }
  }, [savedConfig]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: FieldMappings) => {
      return apiRequest("PUT", "/api/configuration", { fieldMappings: data });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/configuration"] });
      await queryClient.refetchQueries({ queryKey: ["/api/configuration"] });
      toast({
        title: "Configuracion Guardada",
        description: "Configuraciones de Diploma guardada exitosamente.",
        variant: "success",
      });
    },
    onError: async (err: any) => {
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // const saveMutation = useMutation({
  //   mutationFn: async (data: FieldMappings) => {
  //     return apiRequest("POST", "/api/configuration", { fieldMappings: data });
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["/api/configuration"] });
  //     toast({
  //       title: "Configuracion Guardada",
  //       description: "Configuraciones de Diploma guardada exitosamente.",
  //       variant: "success",
  //     });
  //   },
  //   onError: () => {
  //     toast({
  //       title: "Error",
  //       description: "Failed to save configuration. Please try again.",
  //       variant: "destructive",
  //     });
  //   },
  // });

  // Validate configuration before saving
  const validateConfig = (): boolean => {
    // Check estudiante
    if (!config.estudiante.centered && (config.estudiante.x === undefined || config.estudiante.x < 0)) {
      toast({
        title: "Validation Error",
        description: "Estudiante requiere la Posicion Horizontal (cuando no esta centrado).",
        variant: "destructive",
      });
      return false;
    }
    // Check curso
    if (!config.curso.centered && (config.curso.x === undefined || config.curso.x < 0)) {
      toast({
        title: "Validation Error",
        description: "Curso requiere la Posicion Horizontal (cuando no esta centrado).",
        variant: "destructive",
      });
      return false;
    }
    // Validate hex colors
    if (!isValidHex(config.estudiante.font.color) ||
        !isValidHex(config.curso.font.color) ||
        !isValidHex(config.profesor.font.color) ||
        !isValidHex(config.fecha.font.color)) {
      toast({
        title: "Validation Error",
        description: "Todos los colores deben ser hexadecimal (e.g. #FF5500).",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (validateConfig()) {
      // Build the output JSON based on centered status
      const outputConfig: any = {
        estudiante: {
          y: config.estudiante.y,
          centered: config.estudiante.centered,
          ...(config.estudiante.centered ? {} : { x: config.estudiante.x }),
          font: config.estudiante.font,
        },
        curso: {
          y: config.curso.y,
          centered: config.curso.centered,
          ...(config.curso.centered ? {} : { x: config.curso.x }),
          font: config.curso.font,
        },
        "profesor-signature": config["profesor-signature"],
        profesor: config.profesor,
        fecha: config.fecha,
      };
      saveMutation.mutate(config);
    }
  };

  const handleReset = () => {
    setConfig(defaultFieldMappings);
    toast({
      title: "Reset",
      description: "Configuration reseteado a valores default.",
      variant: "success",
    });
  };

  // Update helpers
  const updateEstudiante = useCallback(
    (updates: Partial<typeof config.estudiante>) => {
      setConfig((prev) => ({
        ...prev,
        estudiante: { ...prev.estudiante, ...updates },
      }));
    },
    []
  );

  const updateCurso = useCallback(
    (updates: Partial<typeof config.curso>) => {
      setConfig((prev) => ({
        ...prev,
        curso: { ...prev.curso, ...updates },
      }));
    },
    []
  );

  const updateProfesorSignature = useCallback(
    (updates: Partial<typeof config["profesor-signature"]>) => {
      setConfig((prev) => ({
        ...prev,
        "profesor-signature": { ...prev["profesor-signature"], ...updates },
      }));
    },
    []
  );

  const updateProfesor = useCallback(
    (updates: Partial<typeof config.profesor>) => {
      setConfig((prev) => ({
        ...prev,
        profesor: { ...prev.profesor, ...updates },
      }));
    },
    []
  );

  const updateFecha = useCallback(
    (updates: Partial<typeof config.fecha>) => {
      setConfig((prev) => ({
        ...prev,
        fecha: { ...prev.fecha, ...updates },
      }));
    },
    []
  );

  // Generate output JSON for display (matching user's required format)
  const generateOutputJson = () => {
    const output: any = {
      estudiante: {
        y: config.estudiante.y,
        centered: config.estudiante.centered,
        font: config.estudiante.font,
      },
      curso: {
        y: config.curso.y,
        centered: config.curso.centered,
        font: config.curso.font,
      },
      "profesor-signature": {
        x: config["profesor-signature"].x,
        y: config["profesor-signature"].y,
        size: config["profesor-signature"].size,
      },
      profesor: {
        x_range: config.profesor.x_range,
        y: config.profesor.y,
        font: config.profesor.font,
      },
      fecha: {
        x: config.fecha.x,
        y: config.fecha.y,
        font: config.fecha.font,
      },
    };
    
    // Add x to estudiante/curso only if not centered
    if (!config.estudiante.centered) {
      output.estudiante.x = config.estudiante.x || 0;
    }
    if (!config.curso.centered) {
      output.curso.x = config.curso.x || 0;
    }
    
    return output;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold" data-testid="text-page-title">
            Configuracion del Diploma
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isLoading}
              data-testid="button-reset"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || isLoading}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>
      </header>

      {/* Error State */}
      {isError && (
        <div className="container mx-auto px-4 py-4">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Error cargando configuracion</p>
              <p className="text-sm text-muted-foreground">Usando valores default. {(error as Error)?.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Two Panel Layout */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Panel - Configuration Form (40%) */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <FormSkeleton />
            ) : (
              <Accordion
                type="multiple"
                defaultValue={["estudiante", "curso", "profesor-signature", "profesor", "fecha"]}
                className="space-y-3"
              >
                {/* Estudiante Configuration */}
                {/* <AccordionItem value="estudiante" className="border rounded-lg overflow-visible"> */}
                <AccordionItem value="estudiante" className="border rounded-lg overflow-hidden bg-card">
                  {/* <AccordionTrigger className="px-4 py-3 bg-card hover:no-underline"> */}
                  <AccordionTrigger className={sectionHeaderClasses("estudiante")}>
                    {/* <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Nombre de Alumno</span>
                    </div> */}
                    <div className="flex items-center gap-2">
                      <span className={sectionAccentClasses("estudiante")} />
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Nombre de Alumno</span>
                    </div>                    
                  </AccordionTrigger>
                  {/* <AccordionContent className="px-4 py-4 bg-card border-t"> */}
                  <AccordionContent className={sectionContentClasses("estudiante")}>
                    <div className="space-y-4">
                      {/* Centered Toggle */}
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Centrado Horizontalmente</Label>
                          <p className="text-xs text-muted-foreground">Cuando OFF, la Posicion Horizontal is requerida</p>
                        </div>
                        <Switch
                          checked={config.estudiante.centered}
                          onCheckedChange={(checked) => {
                            updateEstudiante({ 
                              centered: checked,
                              x: checked ? undefined : (config.estudiante.x || 100)
                            });
                          }}
                          data-testid="switch-estudiante-centered"
                        />
                      </div>

                      {/* Position Controls */}
                      <div className="grid grid-cols-2 gap-3">
                        {!config.estudiante.centered && (
                          <PositionInput
                            label="Posicion Horizontal"
                            value={config.estudiante.x || 0}
                            onChange={(value) => updateEstudiante({ x: value })}
                            testId="input-estudiante-x"
                            helperText="Horizontal position in points"
                            required
                          />
                        )}
                        <PositionInput
                          label="Posicion Vertical"
                          value={config.estudiante.y}
                          onChange={(value) => updateEstudiante({ y: value })}
                          testId="input-estudiante-y"
                          // // // helperText="Posicion vertical desde abajo"
                          required
                        />
                      </div>

                      {/* Font Configuration */}
                      <FontInputGroup
                        label="Font Settings"
                        font={config.estudiante.font}
                        onChange={(font) => updateEstudiante({ font })}
                        fieldId="estudiante"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Curso Configuration */}
                {/* <AccordionItem value="curso" className="border rounded-lg overflow-visible"> */}
                <AccordionItem value="curso" className="border rounded-lg overflow-hidden bg-card">
                  {/* <AccordionTrigger className="px-4 py-3 bg-card hover:no-underline"> */}
                  <AccordionTrigger className={sectionHeaderClasses("curso")}>
                    {/* <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Nombre del Curso</span>
                    </div> */}
                    <div className="flex items-center gap-2">
                      <span className={sectionAccentClasses("curso")} />
                      <GraduationCap className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Nombre de Curso</span>
                    </div>                      
                  </AccordionTrigger>
                  {/* <AccordionContent className="px-4 py-4 bg-card border-t"> */}
                  <AccordionContent className={sectionContentClasses("curso")}>
                    <div className="space-y-4">
                      {/* Centered Toggle */}
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Centrado horizontalmente</Label>
                          <p className="text-xs text-muted-foreground">Cuando OFF, Posicion Horizontal is requerida</p>
                        </div>
                        <Switch
                          checked={config.curso.centered}
                          onCheckedChange={(checked) => {
                            updateCurso({ 
                              centered: checked,
                              x: checked ? undefined : (config.curso.x || 100)
                            });
                          }}
                          data-testid="switch-curso-centered"
                        />
                      </div>

                      {/* Position Controls */}
                      <div className="grid grid-cols-2 gap-3">
                        {!config.curso.centered && (
                          <PositionInput
                            label="Posicion Horizontal"
                            value={config.curso.x || 0}
                            onChange={(value) => updateCurso({ x: value })}
                            testId="input-curso-x"
                            helperText="Horizontal position in points"
                            required
                          />
                        )}
                        <PositionInput
                          label="Posicion Vertical"
                          value={config.curso.y}
                          onChange={(value) => updateCurso({ y: value })}
                          testId="input-curso-y"
                          //  helperText="Posicion vertical desde abajo"
                          required
                        />
                      </div>

                      {/* Font Configuration */}
                      <FontInputGroup
                        label="Font Settings"
                        font={config.curso.font}
                        onChange={(font) => updateCurso({ font })}
                        fieldId="curso"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Profesor Signature Configuration */}
                <AccordionItem value="profesor-signature" className="border rounded-lg overflow-hidden bg-card">
                  {/* <AccordionTrigger className="px-4 py-3 bg-card hover:no-underline"> */}
                  <AccordionTrigger className={sectionHeaderClasses("profesor-signature")}>
                    <div className="flex items-center gap-2">
                      <span className={sectionAccentClasses("profesor-signature")} />
                      <PenTool className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Firma del Profesor</span>
                    </div>
                  </AccordionTrigger>
                  {/* <AccordionContent className="px-4 py-4 bg-card border-t"> */}
                  <AccordionContent className={sectionContentClasses("profesor-signature")}>
                    <div className="space-y-4">
                      {/* Position Controls */}
                      <div className="grid grid-cols-2 gap-3">
                        <PositionInput
                          label="Posicion Horizontal"
                          value={config["profesor-signature"].x}
                          onChange={(value) => updateProfesorSignature({ x: value })}
                          testId="input-profesor-signature-x"
                          helperText="Horizontal position in points"
                          required
                        />
                        <PositionInput
                          label="Posicion Vertical"
                          value={config["profesor-signature"].y}
                          onChange={(value) => updateProfesorSignature({ y: value })}
                          testId="input-profesor-signature-y"
                          helperText="Vertical position from bottom"
                          required
                        />
                      </div>

                      {/* Size Control */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Tamaño de firma (50-200)
                          <span className="text-destructive ml-1">*</span>
                        </Label>
                        <Input
                          type="number"
                          min={50}
                          max={200}
                          value={config["profesor-signature"].size}
                          onChange={(e) =>
                            updateProfesorSignature({
                              size: parseInt(e.target.value) || 125,
                            })
                          }
                          data-testid="input-profesor-signature-size"
                        />
                        <p className="text-xs text-muted-foreground">Tamaño de la firma en puntos</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Profesor Name Configuration */}
                <AccordionItem value="profesor" className="border rounded-lg overflow-hidden bg-card">
                  {/* <AccordionTrigger className="px-4 py-3 bg-card hover:no-underline"> */}
                  <AccordionTrigger className={sectionHeaderClasses("profesor")}>
                    <div className="flex items-center gap-2">
                      <span className={sectionAccentClasses("profesor")} />
                      <UserCircle className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Nombre del Profesor</span>
                    </div>
                  </AccordionTrigger>
                  {/* <AccordionContent className="px-4 py-4 bg-card border-t"> */}
                  <AccordionContent className={sectionContentClasses("profesor")}>
                    <div className="space-y-4">
                      {/* X Range Controls */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          Rango posicion X (Min - Max)
                          <span className="text-destructive ml-1">*</span>
                        </Label>
                        <p className="text-xs text-muted-foreground mb-2">El texto sera centrado desde este rango</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Input
                              type="number"
                              min={0}
                              value={config.profesor.x_range[0]}
                              onChange={(e) =>
                                updateProfesor({
                                  x_range: [
                                    parseInt(e.target.value) || 0,
                                    config.profesor.x_range[1],
                                  ],
                                })
                              }
                              placeholder="Min X"
                              data-testid="input-profesor-x-min"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Min X</p>
                          </div>
                          <div>
                            <Input
                              type="number"
                              min={0}
                              value={config.profesor.x_range[1]}
                              onChange={(e) =>
                                updateProfesor({
                                  x_range: [
                                    config.profesor.x_range[0],
                                    parseInt(e.target.value) || 0,
                                  ],
                                })
                              }
                              placeholder="Max X"
                              data-testid="input-profesor-x-max"
                            />
                            <p className="text-xs text-muted-foreground mt-1">Max X</p>
                          </div>
                        </div>
                      </div>

                      <PositionInput
                        label="Posicion Vertical"
                        value={config.profesor.y}
                        onChange={(value) => updateProfesor({ y: value })}
                        testId="input-profesor-y"
                        helperText="Vertical position from bottom"
                        required
                      />

                      {/* Font Configuration */}
                      <FontInputGroup
                        label="Font Settings"
                        font={config.profesor.font}
                        onChange={(font) => updateProfesor({ font })}
                        fieldId="profesor"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Fecha Configuration */}
                <AccordionItem value="fecha" className="border rounded-lg overflow-hidde bg-card">
                  {/* <AccordionTrigger className="px-4 py-3 bg-card hover:no-underline"> */}
                  <AccordionTrigger className={sectionHeaderClasses("fecha")}>
                    <div className="flex items-center gap-2">
                    <span className={sectionAccentClasses("fecha")} />
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">Fecha</span>
                    </div>
                  </AccordionTrigger>
                  {/* <AccordionContent className="px-4 py-4 bg-card border-t"> */}
                  <AccordionContent className={sectionContentClasses("fecha")}>
                    <div className="space-y-4">
                      {/* Position Controls */}
                      <div className="grid grid-cols-2 gap-3">
                        <PositionInput
                          label="Posicion Horizontal"
                          value={config.fecha.x}
                          onChange={(value) => updateFecha({ x: value })}
                          testId="input-fecha-x"
                          helperText="Horizontal position in points"
                          required
                        />
                        <PositionInput
                          label="Posicion Vertical"
                          value={config.fecha.y}
                          onChange={(value) => updateFecha({ y: value })}
                          testId="input-fecha-y"
                          helperText="Vertical position from bottom"
                          required
                        />
                      </div>

                      {/* Font Configuration */}
                      <FontInputGroup
                        label="Font Settings"
                        font={config.fecha.font}
                        onChange={(font) => updateFecha({ font })}
                        fieldId="fecha"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>

          {/* Right Panel - Preview (60%) */}
          <div className="lg:col-span-3">
            <Card className="sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Vista Previa</CardTitle>
                <p className="text-sm text-muted-foreground">Representación a escala: las coordenadas están en puntos PDF (1 punto = 1/72 de pulgada).</p>
              </CardHeader>
              <CardContent>
                {/* Diploma Preview Canvas */}
                <div
                  className="relative bg-white border rounded-lg shadow-sm overflow-hidden"
                  style={{
                    aspectRatio: `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}`,
                    minHeight: "450px",
                  }}
                  data-testid="preview-canvas"
                >
                  {/* Coordinate Grid Overlay */}
                  <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#666" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                  </div>

                  {/* Preview Elements - Using percentage-based positioning that maps to PDF coordinates */}
                  <div className="absolute inset-0">
                    {/* Estudiante Preview */}
                    <div
                      className="absolute whitespace-nowrap"
                      style={{
                        bottom: `${(config.estudiante.y / PREVIEW_HEIGHT) * 100}%`,
                        left: config.estudiante.centered ? "50%" : `${((config.estudiante.x || 0) / PREVIEW_WIDTH) * 100}%`,
                        transform: config.estudiante.centered ? "translateX(-50%)" : "none",
                        color: config.estudiante.font.color,
                        fontFamily: config.estudiante.font.name.split("-")[0],
                        fontSize: `${Math.max(config.estudiante.font.size * 0.6, 10)}px`,
                        fontWeight: config.estudiante.font.name.includes("Bold") ? "bold" : "normal",
                        fontStyle:
                          config.estudiante.font.name.includes("Oblique") ||
                          config.estudiante.font.name.includes("Italic")
                            ? "italic"
                            : "normal",
                      }}
                      data-testid="preview-estudiante"
                    >
                      Jose Perez Perez
                    </div>

                    {/* Curso Preview */}
                    <div
                      className="absolute whitespace-nowrap"
                      style={{
                        bottom: `${(config.curso.y / PREVIEW_HEIGHT) * 100}%`,
                        left: config.curso.centered ? "50%" : `${((config.curso.x || 0) / PREVIEW_WIDTH) * 100}%`,
                        transform: config.curso.centered ? "translateX(-50%)" : "none",
                        color: config.curso.font.color,
                        fontFamily: config.curso.font.name.split("-")[0],
                        fontSize: `${Math.max(config.curso.font.size * 0.6, 8)}px`,
                        fontWeight: config.curso.font.name.includes("Bold") ? "bold" : "normal",
                        fontStyle:
                          config.curso.font.name.includes("Oblique") ||
                          config.curso.font.name.includes("Italic")
                            ? "italic"
                            : "normal",
                      }}
                      data-testid="preview-curso"
                    >
                      Curso de Artistico Avanzado
                    </div>

                    {/* Profesor Signature Preview */}
                    <div
                      className="absolute border-2 border-dashed border-gray-400 rounded flex items-center justify-center text-gray-500 text-xs bg-gray-50"
                      style={{
                        bottom: `${(config["profesor-signature"].y / PREVIEW_HEIGHT) * 100}%`,
                        left: `${(config["profesor-signature"].x / PREVIEW_WIDTH) * 100}%`,
                        width: `${(config["profesor-signature"].size / PREVIEW_WIDTH) * 100}%`,
                        height: `${((config["profesor-signature"].size * 0.6) / PREVIEW_HEIGHT) * 100}%`,
                      }}
                      data-testid="preview-profesor-signature"
                    >
                      Firma
                    </div>

                    {/* Profesor Name Preview */}
                    <div
                      className="absolute whitespace-nowrap"
                      style={{
                        bottom: `${(config.profesor.y / PREVIEW_HEIGHT) * 100}%`,
                        left: `${((config.profesor.x_range[0] + config.profesor.x_range[1]) / 2 / PREVIEW_WIDTH) * 100}%`,
                        transform: "translateX(-50%)",
                        color: config.profesor.font.color,
                        fontFamily: config.profesor.font.name.split("-")[0],
                        fontSize: `${Math.max(config.profesor.font.size * 0.6, 8)}px`,
                        fontWeight: config.profesor.font.name.includes("Bold") ? "bold" : "normal",
                        fontStyle:
                          config.profesor.font.name.includes("Oblique") ||
                          config.profesor.font.name.includes("Italic")
                            ? "italic"
                            : "normal",
                      }}
                      data-testid="preview-profesor"
                    >
                      Dr. Maria Perez Perez
                    </div>

                    {/* Fecha Preview */}
                    <div
                      className="absolute whitespace-nowrap"
                      style={{
                        bottom: `${(config.fecha.y / PREVIEW_HEIGHT) * 100}%`,
                        left: `${(config.fecha.x / PREVIEW_WIDTH) * 100}%`,
                        color: config.fecha.font.color,
                        fontFamily: config.fecha.font.name.split("-")[0],
                        fontSize: `${Math.max(config.fecha.font.size * 0.6, 8)}px`,
                        fontWeight: config.fecha.font.name.includes("Bold") ? "bold" : "normal",
                        fontStyle:
                          config.fecha.font.name.includes("Oblique") ||
                          config.fecha.font.name.includes("Italic")
                            ? "italic"
                            : "normal",
                      }}
                      data-testid="preview-fecha"
                    >
                      {formattedToday}
                    </div>
                  </div>

                  {/* Diploma Border Decoration */}
                  <div className="absolute inset-3 border-2 border-gray-300 rounded pointer-events-none" />
                  <div className="absolute inset-5 border border-gray-200 rounded pointer-events-none" />
                </div>

                {/* JSON Output Preview */}
                {/* <div className="mt-4">
                  <Label className="text-sm font-medium mb-2 block">Generated JSON (fieldMappings)</Label>
                  <pre
                    className="bg-muted p-3 rounded-md text-xs overflow-x-auto font-mono max-h-64 overflow-y-auto"
                    data-testid="text-json-output"
                  >
                    {JSON.stringify(generateOutputJson(), null, 2)}
                  </pre>
                </div> */}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
