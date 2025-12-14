// Reference: blueprint:javascript_log_in_with_replit
// Reference: blueprint:javascript_object_storage
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./googleAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import multer from "multer";
import Papa from "papaparse";
import { ObjectPermission } from "./objectAcl";
import {
  insertSignatureSchema,
  insertTemplateSchema,
  insertDiplomaBatchSchema,
  insertConfigurationSchema,
} from "@shared/schema";

// Configure multer for CSV file uploads
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ======= Auth Routes =======
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ======= Signature Routes =======
  app.get('/api/signatures', isAuthenticated, async (req, res) => {
    try {
      const signatures = await storage.getSignatures();
      res.json(signatures);
    } catch (error) {
      console.error("Error fetching signatures:", error);
      res.status(500).json({ message: "Failed to fetch signatures" });
    }
  });

  app.post('/api/signatures', isAuthenticated, async (req: any, res) => {
    try {
      const email = req.user.claims.email;
      const data = insertSignatureSchema.parse({ ...req.body, createdBy: email });
      const signature = await storage.createSignature(data);
      res.json(signature);
    } catch (error) {
      console.error("Error creating signature:", error);
      res.status(400).json({ message: "Failed to create signature" });
    }
  });

  app.patch('/api/signatures/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const signature = await storage.updateSignature(id, req.body);
      if (!signature) {
        return res.status(404).json({ message: "Signature not found" });
      }
      res.json(signature);
    } catch (error) {
      console.error("Error updating signature:", error);
      res.status(400).json({ message: "Failed to update signature" });
    }
  });

  app.delete('/api/signatures/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSignature(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting signature:", error);
      res.status(500).json({ message: "Failed to delete signature" });
    }
  });

  // ======= Template Routes =======
  app.get('/api/templates', isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.post('/api/templates', isAuthenticated, async (req: any, res) => {
    try {
      const email = req.user.claims.email;
      const data = insertTemplateSchema.parse({ ...req.body, createdBy: email });
      const template = await storage.createTemplate(data);
      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(400).json({ message: "Failed to create template" });
    }
  });

  app.patch('/api/templates/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.updateTemplate(id, req.body);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(400).json({ message: "Failed to update template" });
    }
  });

  app.post('/api/templates/:id/activate', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setTemplateActive(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error activating template:", error);
      res.status(500).json({ message: "Failed to activate template" });
    }
  });

  app.delete('/api/templates/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // ======= Diploma Batch Routes =======
  app.get('/api/diploma-batches', isAuthenticated, async (req, res) => {
    try {
      const batches = await storage.getDiplomaBatches();
      res.json(batches);
    } catch (error) {
      console.error("Error fetching diploma batches:", error);
      res.status(500).json({ message: "Failed to fetch diploma batches" });
    }
  });

  app.post('/api/diploma-batches', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const email = req.user.claims.email;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse CSV
      const csvText = file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvText, { header: true });
      const totalRecords = parsed.data.filter((row: any) => 
        row['First Name'] || row['first_name']
      ).length;

      const data = insertDiplomaBatchSchema.parse({
        fileName: file.originalname,
        totalRecords,
        status: 'processing',
        createdBy: email,
      });

      const batch = await storage.createDiplomaBatch(data);
      
      // Simulate async processing
      setTimeout(async () => {
        const success = Math.random() > 0.2; // 80% success rate
        await storage.updateDiplomaBatch(batch.id, {
          status: success ? 'completed' : 'failed',
          zipUrl: success ? '#mock-zip-url' : undefined,
        });
      }, 3000);

      res.json(batch);
    } catch (error) {
      console.error("Error creating diploma batch:", error);
      res.status(400).json({ message: "Failed to create diploma batch" });
    }
  });

  app.patch('/api/diploma-batches/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const batch = await storage.updateDiplomaBatch(id, req.body);
      if (!batch) {
        return res.status(404).json({ message: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      console.error("Error updating diploma batch:", error);
      res.status(500).json({ message: "Failed to update diploma batch" });
    }
  });

  // ======= Configuration Routes =======
  app.get('/api/configuration', isAuthenticated, async (req, res) => {
    try {
      const config = await storage.getConfiguration();
      res.json(config || { fieldMappings: {} });
    } catch (error) {
      console.error("Error fetching configuration:", error);
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  app.put('/api/configuration', isAuthenticated, async (req: any, res) => {
    try {
      console.log(" api/configuration PUT  req: ", req);
      const email = req.user.claims.email;
      const data = insertConfigurationSchema.parse({ ...req.body, updatedBy: email });
      const config = await storage.upsertConfiguration(data);
      res.json(config);
    } catch (error) {
      console.error("Error updating configuration:", error);
      res.status(400).json({ message: "Failed to update configuration" });
    }
  });

  // ======= Object Storage Routes =======
  // Reference: blueprint:javascript_object_storage
  
  // Endpoint for serving private objects (signatures, templates)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Endpoint for getting upload URL
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  // Endpoint for setting ACL after upload (signatures)
  app.put("/api/signatures/upload", isAuthenticated, async (req: any, res) => {
    if (!req.body.url) {
      return res.status(400).json({ error: "url is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.url,
        {
          owner: userId,
          visibility: "public", // Signatures are public for viewing on diplomas
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting signature ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Endpoint for setting ACL after upload (templates)
  app.put("/api/templates/upload", isAuthenticated, async (req: any, res) => {
    if (!req.body.url) {
      return res.status(400).json({ error: "url is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.url,
        {
          owner: userId,
          visibility: "private", // Templates are private
        },
      );

      res.status(200).json({ objectPath });
    } catch (error) {
      console.error("Error setting template ACL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
