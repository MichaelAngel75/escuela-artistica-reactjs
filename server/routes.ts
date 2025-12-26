// # -----------------------------------------------------------------------------------------------------
// # ---- Examples to call api internal endpoints:
// # curl -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' http://localhost:5000/internal/signatures
// # curl -H 'api-key-pohualizcalli: algunaw=conrasenia-mejor-ymaslarGA' https://admin.pohualizcalli.link/internal/signatures
// -------------------------------------------------------------------------------------------------
// # curl -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' http://localhost:5000/internal/templates/active
// # curl -H 'api-key-pohualizcalli: algunaw=conrasenia-mejor-ymaslarGA' https://admin.pohualizcalli.link/internal/templates/active
// -------------------------------------------------------------------------------------------------
// # curl -X POST 'http://localhost:5000/internal/reload-api-key' \
// #   -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@'
//  curl -X POST 'https://admin.pohualizcalli.link/internal/reload-api-key' \
//    -H 'api-key-pohualizcalli: adios-mUNDO-COMO-3mejor-esto!@'
// -------------------------------------------------------------------------------------------------
//  curl -X PATCH 'http://localhost:5000/internal/diploma-batches/1' \
//    -H 'Content-Type: application/json' \
//    -H 'api-key-pohualizcalli: adios-mUNDO-COMO-3mejor-esto!@' \
//    -d '{
//      "status": "completado",
//      "totalRecords": 3
//    }'
//   curl -X PATCH 'https://admin.pohualizcalli.link/internal/diploma-batches/1' \
//     -H 'Content-Type: application/json' \
//     -H 'api-key-pohualizcalli: adios-mUNDO-COMO-3mejor-esto!@' \
//     -d '{
//       "status": "completado",
//       "totalRecords": 1
//     }'
// //  -----------------------------------------------------------------------------------------------------


/// --- NAT (EC2 - Other ==> )
// there's 4 dollar for group  type:  EC2: Data Transfer - Inter AZ,  
//         1.59 usd  on EC2: EBS - SSD(gp2),  
//         1.28 usd on EC2: EBS - SSD(gp3) using 16 GB on the month, 
//         0 usd EC2: EBS Optimized (but shows 397 hours, then after that it will cost? how much? ),  
//         0.07 usd on EC2: NAT Gateway - Data Processed, 
//         18 usd on EC2: NAT Gateway - Running Hours, (total usage 400 hours) can be reduced or optimized this cost?  
// -----------
//         5) EC2: NAT Gateway – Running Hours ($18 for ~400 hours)
//         What this means (important)
//         This is the fixed hourly cost of just having a NAT Gateway:
//         ~$0.045/hour × ~400 hours ≈ $18
//         Even with zero traffic, this cost exists.
// ----------
// Can the NAT Gateway cost be reduced?
// Yes — this is your biggest optimization opportunity
// Option A (Best practice): Keep NAT, but reduce traffic through it
//     Add VPC endpoints so NAT is only used for true internet traffic.
//     Add these first (high ROI):
//     S3 Gateway Endpoint
//     Interface endpoints for:
//         ecr.api
//         ecr.dkr
//         logs
//         secretsmanager / ssm / sts (if used)
//     This does not remove the $18, but prevents future scale-related increases.
// Option B: Remove NAT Gateway entirely (only if conditions allow)
//     You can delete the NAT Gateway only if:
//         ECS tasks never call public APIs
//         All AWS service access is via endpoints
//         No OS/package installs at runtime
//         No outbound internet dependency
//     Savings: ~$30–$35/month per NAT Gateway
//     Risk: high if you miss even one dependency   
// Option C: Use NAT instance (not recommended for production)
//     Cheaper EC2 instance (t4g.nano, etc.)
//     You manage patching, HA, scaling, failures
// This is rarely worth it unless you are cost-constrained and non-production.

// Reference: blueprint:javascript_log_in_with_replit
// Reference: blueprint:javascript_object_storage
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./googleAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import Papa from "papaparse";
import { ObjectPermission } from "./objectAcl";
import {
  insertSignatureSchema,
  insertTemplateSchema,
  insertDiplomaBatchSchema,
  insertConfigurationSchema,
} from "@shared/schema";

import multer from "multer";
import { buildSignatureKey, buildTemplateKey, deleteFolderFromS3, 
         buildGeneratedDiplomasCsvKey, uploadResourceToS3,
         deleteImageFromS3, extractParentPrefixFromUrl  } from "./s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import crypto from "crypto";

const INTERNAL_API_HEADER = process.env.ACADEMY_INTERNAL_API_HEADER;

// Prefer SSM as source of truth; env var is fallback/bootstrapping
const INTERNAL_KEY_PARAM_NAME = process.env.ACADEMY_API_KEY_INTERNAL_CALL_PARAM_NAME;
let INTERNAL_KEY_CACHE: string | null;

const ssm = new SSMClient({ region: process.env.ACADEMY_AWS_REGION || process.env.AWS_REGION });

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function loadInternalKeyFromSsm(): Promise<string> {
  if (!INTERNAL_KEY_PARAM_NAME) {
    throw new Error("API_KEY_INTERNAL_CALL_PARAM_NAME is not set");
  }
  const out = await ssm.send(
    new GetParameterCommand({
      Name: INTERNAL_KEY_PARAM_NAME,
      WithDecryption: true,
    }),
  );

  const value = out.Parameter?.Value?.trim();
  if (!value) throw new Error("SSM parameter returned empty value");
  INTERNAL_KEY_CACHE = value;
  console.log(" ::: debug ::: loading INTERNAL_KEY_PARAM_NAME:  ", INTERNAL_KEY_PARAM_NAME );
  console.log(" ::: debug ::: loading INTERNAL_KEY_PARAM_VALUE:  ", value )
  return value;
}

// Middleware: validate internal header
function requireInternalApiKey(req: any, res: any, next: any) {
  console.log(" ::: debug :: expected header: INTERNAL_API_HEADER: ", INTERNAL_API_HEADER);
  const provided = String(req.header(INTERNAL_API_HEADER) ?? "").trim();
  const expected = (INTERNAL_KEY_CACHE ?? "").trim();
  console.log(" ::: debug ::: provided: ", provided);
  console.log(" ::: debug ::: expected: ", expected);

  if (!expected) {
    // Safer to fail closed; you can also attempt lazy-load here
    return res.status(503).json({ message: "Internal key not initialized" });
  }

  if (!provided || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ message: "Unauthorized-Internal" });
  }

  return next();
}



// Configure multer for CSV file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Best-effort: refresh internal key from SSM on boot
console.log(" :: debug :: is going to load the following SSM: (INTERNAL_KEY_PARAM_NAME): ", INTERNAL_KEY_PARAM_NAME)
if (INTERNAL_KEY_PARAM_NAME) {
  loadInternalKeyFromSsm().catch((e) =>
    console.error("Failed to load internal API key from SSM:", e),
  );
}


export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // ======= Internal Routes =======

  app.get("/internal/configuration", requireInternalApiKey, async (req, res) => {
    try {
      const config = await storage.getConfiguration();
      res.json(config || { fieldMappings: {} });
    } catch (error) {
      console.error("Error fetching configuration:", error);
      res.status(500).json({ message: "Failed to fetch configuration" });
    }  
  });


  app.get("/internal/signatures", requireInternalApiKey, async (req, res) => {
    try {
      const signatures = await storage.getSignatures();
      return res.json({ signatures });
    } catch (e) {
      console.error("Error fetching internal signatures:", e);
      return res.status(500).json({ message: "Failed to fetch signatures" });
    }   
  });

  app.get("/internal/templates/active", requireInternalApiKey, async (req, res) => {
    try {
      const template = await storage.getActiveTemplate(); // implement this
      if (!template) return res.status(404).json({ message: "No active template found" });
      return res.json({ template });
    } catch (e) {
      console.error("Error fetching active template:", e);
      return res.status(500).json({ message: "Failed to fetch active template" });
    }
  });
  
  app.patch("/internal/diploma-batches/:id", requireInternalApiKey, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  
      // Allow-list only fields that Lambda should be able to update
      const allowed: any = {};
      const body = req.body ?? {};
  
      if (typeof body.status === "string") allowed.status = body.status; // validate against enum if possible
      if (typeof body.zipUrl === "string" || body.zipUrl === null) allowed.zipUrl = body.zipUrl;
      if (typeof body.csvUrl === "string" || body.csvUrl === null) allowed.csvUrl = body.csvUrl;
      if (typeof body.fileName === "string") allowed.fileName = body.fileName;
      if (typeof body.totalRecords === "number") allowed.totalRecords = body.totalRecords;
  
      // Always update timestamp server-side
      allowed.updatedAt = new Date();
  
      if (Object.keys(allowed).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
  
      const updated = await storage.updateDiplomaBatch(id, allowed);
      if (!updated) return res.status(404).json({ message: "Batch not found" });
  
      return res.json(updated);
    } catch (e) {
      console.error("Error updating diploma batch (internal):", e);
      return res.status(500).json({ message: "Failed to update diploma batch" });
    }
  });
  
  app.post("/internal/reload-api-key", requireInternalApiKey, async (req, res) => {
    try {
      console.log(" :: debug :: trying to refresh Api-Key req:", req)
      const newKey = await loadInternalKeyFromSsm();
      return res.json({ success: true, loaded: Boolean(newKey) });
    } catch (e) {
      console.error("Failed to reload internal key from SSM:", e);
      return res.status(500).json({ message: "Failed to reload internal key" });
    }
  });
  




  
  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
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

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // ======= Signature Routes =======
  // same multer you already have:
  const uploadImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // Create signature WITH file
  app.post("/api/signatures/file", isAuthenticated, uploadImage.single("file"), async (req: any, res) => {
    try {
      const email = req.user.claims.email;
      const name = String(req.body?.name ?? "").trim();
      const professorName = String(req.body?.professorName ?? "").trim();
      const file = req.file as Express.Multer.File | undefined;

      if (!name) return res.status(400).json({ message: "name is required" });
      if (!professorName) return res.status(400).json({ message: "professorName is required" });
      if (!file) return res.status(400).json({ message: "file is required" });
      if (!file.mimetype.startsWith("image/")) return res.status(400).json({ message: "Only image files are allowed" });

      const key = buildSignatureKey(file.originalname); // add in s3.ts
      const url = await uploadResourceToS3(file, key);

      const created = await storage.createSignature({
        name: name.toLowerCase(),
        professorName,
        url,
        createdBy: email,
      });

      return res.json(created);
    } catch (e) {
      console.error("Error creating signature:", e);
      return res.status(400).json({ message: "Failed to create signature" });
    }
  });

  // Replace signature image (delete old from S3, upload new, update DB)
  app.patch("/api/signatures/:id", isAuthenticated, uploadImage.single("file"), async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

      const existing = await storage.getSignature(id);
      if (!existing) return res.status(404).json({ message: "Signature not found" });

      const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
      const professorName = typeof req.body?.professorName === "string" ? req.body.professorName.trim() : undefined;
      const file = req.file as Express.Multer.File | undefined;

      if (!name && !file && !professorName) return res.status(400).json({ message: "No changes provided" });
      if (!file) return res.status(400).json({ message: "file is required" });
      if (!file.mimetype.startsWith("image/")) return res.status(400).json({ message: "Only image files are allowed" });

      // 1) Upload new
      const key = buildSignatureKey(file.originalname);
      const newUrl = await uploadResourceToS3(file, key);

      // 2) Update DB
      const updated = await storage.updateSignature(id, 
        { url: newUrl, professorName: professorName, name: name});
        // const updated = await storage.updateTemplate(id, {
        //   ...(name ? { name } : {}),
        //   ...(newUrl ? { url: newUrl } : {}),
        // });        

      // 3) Best-effort delete old
      if (existing.url && existing.url !== newUrl) {
        console.log(" :: debug 10 :: " );
        deleteImageFromS3(existing.url).catch((err) => console.error("Failed deleting old signature:", err));
      }

      return res.json(updated);
    } catch (e) {
      console.error("Error replacing signature image:", e);
      return res.status(400).json({ message: "Failed to replace signature image" });
    }
  });

  app.get('/api/signatures', isAuthenticated, async (req, res) => {
    try {
      const signatures = await storage.getSignatures();
      res.json(signatures);
    } catch (error) {
      console.error("Error fetching signatures:", error);
      res.status(500).json({ message: "Failed to fetch signatures" });
    }
  });

  app.delete('/api/signatures/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const signature = await storage.getSignature(id);

      if (signature.url) {
        deleteImageFromS3(signature.url).catch((err) => console.error("Failed deleting old signature:", err));
      }

      await storage.deleteSignature(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting signature:", error);
      res.status(500).json({ message: "Failed to delete signature" });
    }
  });

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // ======= Template Routes =======

  // List templates from DB
  app.get("/api/templates", isAuthenticated, async (req, res) => {
    try {
      const list = await storage.getTemplates();
      res.json(list);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Presign for preview/download (private S3 objects)
  app.get("/api/templates/:id/presign", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const template = await storage.getTemplate(id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      res.json({ url: template.url });
    } catch (error) {
      console.error("Error presigning template:", error);
      res.status(500).json({ message: "Failed to presign template" });
    }
  });

  // Create template: upload pdf to S3, store url in DB
  app.post("/api/templates", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const email = req.user.claims.email;

      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ message: "name is required" });

      const file = req.file;
      if (!file) return res.status(400).json({ message: "file is required" });
      if (file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "Only PDF files are allowed" });
      }

      const key = buildTemplateKey(file.originalname);

      const s3Url = await uploadResourceToS3(file, key);

      const data = insertTemplateSchema.parse({
        name,
        url: s3Url,
        status: "Inactive", // default
        createdBy: email,
      });

      const template = await storage.createTemplate(data);
      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(400).json({ message: "Failed to create template" });
    }
  });

  const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  });  

  // Update template: rename and/or replace pdf
  app.patch(
    "/api/templates/:id",
    isAuthenticated,
    uploadPdf.single("file"),
    async (req: any, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
  
        const existing = await storage.getTemplate(id);
        if (!existing) return res.status(404).json({ message: "Template not found" });
  
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
        const file = req.file as Express.Multer.File | undefined;
  
        if (!name && !file) return res.status(400).json({ message: "No changes provided" });
  
        let newUrl: string | undefined;
  
        if (file) {
          if (file.mimetype !== "application/pdf") {
            return res.status(400).json({ message: "Only PDF files are allowed" });
          }
  
          const key = buildTemplateKey(file.originalname);
          newUrl = await uploadResourceToS3(file, key);
        }
  
        const updated = await storage.updateTemplate(id, {
          ...(name ? { name } : {}),
          ...(newUrl ? { url: newUrl } : {}),
        });
  
        // delete old folder best-effort AFTER DB update
        if (newUrl && existing.url && existing.url !== newUrl) {
          const oldPrefix = extractParentPrefixFromUrl(existing.url);
          if (oldPrefix) {
            deleteFolderFromS3(oldPrefix).catch((e) =>
              console.error("Failed to delete old template folder:", e),
            );
          }
        }
  
        return res.json(updated);
      } catch (error) {
        console.error("Error updating template:", error);
        return res.status(400).json({ message: "Failed to update template" });
      }
    },
  );

  // Enforce only one Active
  app.post("/api/templates/:id/activate", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      await storage.setTemplateActive(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error activating template:", error);
      res.status(500).json({ message: "Failed to activate template" });
    }
  });

  // Delete from S3 + DB
  app.delete("/api/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getTemplate(id);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      if (existing.url) {
        const urlExisting = existing.url;
        await deleteImageFromS3(urlExisting);        
      }

      await storage.deleteTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });


  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // ======= Diploma Batch Routes =======
  const uploadCsv = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  });

  const SQS_QUEUE_URL = process.env.ACADEMY_SQS_DIPLOMA_GENERATION;
  const sqs = new SQSClient({ region: process.env.ACADEMY_AWS_REGION });

  async function sendBatchSqsMessage(payload: {
    created_by: string;
    file_name: string;
    csv_url: string;
    batch_id: number;
  }) {
    const cmd = new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify(payload),
    });
    await sqs.send(cmd);
  }

  app.get("/api/diploma-batches", isAuthenticated, async (req, res) => {
    try {
      const list = await storage.getDiplomaBatches();
      res.json(list);
    } catch (e) {
      console.error("Error fetching diploma batches:", e);
      res.status(500).json({ message: "Failed to fetch diploma batches" });
    }
  });



app.post("/api/diploma-batches", isAuthenticated, uploadCsv.single("file"), async (req: any, res) => {
  try {
    const email = req.user?.claims?.email;
    const file = req.file as Express.Multer.File | undefined;

    if (!file) return res.status(400).json({ message: "file is required" });
    if (file.mimetype !== "text/csv" && !file.originalname.toLowerCase().endsWith(".csv")) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }

    // Count records quickly (optional, but your DB requires it)
    const csvText = file.buffer.toString("utf-8");
    const parsed = Papa.parse(csvText, { header: true });
    const totalRecords = (parsed.data ?? []).filter((row: any) => Object.values(row ?? {}).some(Boolean)).length;

    // --------------------------------------------------
    // 2. Create DB batch FIRST (get autogenerated id)
    // --------------------------------------------------
    const batch = await storage.createDiplomaBatch({
      fileName: file.originalname,
      status: "recibido",
      totalRecords,
      zipUrl: null,
      csvUrl: null,
      createdBy: email,
    });

    const idProceso = batch.id; // ✅ THIS is the key piece

    // --------------------------------------------------
    // 3. Build S3 key using DB id
    // --------------------------------------------------
    const key = buildGeneratedDiplomasCsvKey(file.originalname, idProceso);

    // --------------------------------------------------
    // 4. Upload CSV to S3
    // --------------------------------------------------
    const csvUrl = await uploadResourceToS3(file, key);
    if (!csvUrl) return res.status(500).json({ message: "Failed to upload CSV to S3" });

    // --------------------------------------------------
    // 5. Update SAME DB row with csvUrl
    // --------------------------------------------------
    const updatedBatch = await storage.updateDiplomaBatch(idProceso, {
      csvUrl,
    });

    // Send SQS message
    await sendBatchSqsMessage({
      created_by: email,
      file_name: file.originalname,
      csv_url: csvUrl,
      batch_id: idProceso,
    });

    return res.json(batch);
  } catch (e) {
    console.error("Error creating diploma batch:", e);
    return res.status(400).json({ message: "Failed to create diploma batch" });
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

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
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

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // ======= Object Storage Routes =======
  // Reference: blueprint:javascript_object_storage
  
  // Endpoint for serving private objects (signatures, templates)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const email = req.user?.claims?.email;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: email,
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

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // Endpoint for getting upload URL
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    res.json({ uploadURL });
  });

  // ___________________________________________________________________________________
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // -----------------------------------------------------------------------------------
  // Endpoint for setting ACL after upload (templates)
  app.put("/api/templates/upload", isAuthenticated, async (req: any, res) => {
    if (!req.body.url) {
      return res.status(400).json({ error: "url is required" });
    }

    const email = req.user?.claims?.email;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.url,
        {
          owner: email,
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
