import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Save, RotateCcw } from "lucide-react";

interface FieldConfig {
    id: string;
    label: string;
    x: number;
    y: number;
    fontSize: number;
}

export default function ConfigurationPage() {
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldConfig[]>([
      { id: 'firstName', label: 'First Name', x: 100, y: 300, fontSize: 24 },
      { id: 'lastName', label: 'Last Name', x: 300, y: 300, fontSize: 24 },
      { id: 'course', label: 'Course Name', x: 200, y: 400, fontSize: 18 },
      { id: 'professor', label: 'Professor Name', x: 200, y: 500, fontSize: 16 },
      { id: 'signature', label: 'Signature Image', x: 200, y: 600, fontSize: 0 }, // Font size 0 implies image scale or n/a
  ]);

  const handleChange = (id: string, key: keyof FieldConfig, value: string) => {
      const numValue = parseInt(value) || 0;
      setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: numValue } : f));
  };

  const handleSave = () => {
      // Mock save success
      toast({ 
          title: "Configuration Saved", 
          description: "Diploma layout positions updated.",
          variant: "success"
      });
  };

  const handleReset = () => {
      // Reset to defaults
      setFields([
        { id: 'firstName', label: 'First Name', x: 100, y: 300, fontSize: 24 },
        { id: 'lastName', label: 'Last Name', x: 300, y: 300, fontSize: 24 },
        { id: 'course', label: 'Course Name', x: 200, y: 400, fontSize: 18 },
        { id: 'professor', label: 'Professor Name', x: 200, y: 500, fontSize: 16 },
        { id: 'signature', label: 'Signature Image', x: 200, y: 600, fontSize: 0 },
      ]);
      toast({ 
          title: "Reset to Defaults", 
          description: "Layout positions restored.",
          variant: "success"
      });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Diploma Configuration</h1>
          <p className="text-muted-foreground">Define precise positioning for dynamic fields</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="w-4 h-4" /> Reset
            </Button>
            <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" /> Save Changes
            </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            {fields.map((field) => (
                <Card key={field.id}>
                    <CardHeader className="py-3">
                        <CardTitle className="text-base font-medium">{field.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-4 pb-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">X Position (px)</label>
                            <Input 
                                type="number" 
                                value={field.x} 
                                onChange={(e) => handleChange(field.id, 'x', e.target.value)} 
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Y Position (px)</label>
                            <Input 
                                type="number" 
                                value={field.y} 
                                onChange={(e) => handleChange(field.id, 'y', e.target.value)} 
                            />
                        </div>
                        {field.id !== 'signature' && (
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Font Size (pt)</label>
                                <Input 
                                    type="number" 
                                    value={field.fontSize} 
                                    onChange={(e) => handleChange(field.id, 'fontSize', e.target.value)} 
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
                  <CardTitle>Visual Preview</CardTitle>
                  <CardDescription>Approximate layout visualization</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="aspect-[1.414] bg-white border border-border shadow-sm relative overflow-hidden w-full max-w-md mx-auto">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none opacity-10">
                          <div className="border-r border-black"></div>
                          <div className="border-r border-black"></div>
                          <div className="border-r border-black"></div>
                          <div className="border-r border-black"></div>
                      </div>
                      
                      {fields.map((field) => (
                          <div 
                              key={field.id}
                              className="absolute border border-dashed border-primary/50 bg-primary/5 text-primary px-2 flex items-center justify-center whitespace-nowrap transition-all duration-300"
                              style={{ 
                                  left: `${(field.x / 800) * 100}%`, 
                                  top: `${(field.y / 600) * 100}%`,
                                  fontSize: field.id === 'signature' ? '12px' : `${field.fontSize / 2}px`, // Scale down for preview
                                  transform: 'translate(-50%, -50%)',
                                  width: field.id === 'signature' ? '100px' : 'auto',
                                  height: field.id === 'signature' ? '40px' : 'auto'
                              }}
                          >
                              {field.id === 'signature' ? '[Signature]' : `{${field.label}}`}
                          </div>
                      ))}
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-4">
                      Preview is scaled. Actual output depends on PDF generation engine.
                  </p>
              </CardContent>
          </Card>
      </div>
    </div>
  );
}
