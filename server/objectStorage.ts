// Reference: blueprint:javascript_object_storage
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// /// ------ how to call the below new services -----
// const storage = new ObjectStorageService();

// // 1) upload a blank diploma template PDF for year 2025
// const emptyTemplateUrl = await storage.getEmptyTemplateUploadURL(2025, "base-template.pdf");

// // 2) upload a professor signature PNG for 2025
// const signatureUrl = await storage.getSignatureUploadURL(2025, "prof-garcia.png");

// // 3) upload a generated diploma PDF for generation ID 123
// const diplomaUrl = await storage.getGeneratedDiplomaUploadURL(123, "student-juan-perez.pdf");

export class ObjectStorageService {
  constructor() {}

  async deleteObjectByRawPath(rawPath: string): Promise<void> {
    if (!rawPath) return;
  
    let objectPath = rawPath;
  
    // If the URL is a FULL S3 URL, extract "/bucket/object..."
    // Examples:
    // https://my-bucket.s3.amazonaws.com/folder/file.png
    // https://s3.amazonaws.com/my-bucket/folder/file.png
    if (rawPath.startsWith("https://")) {
      const url = new URL(rawPath);
  
      // CASE 1: https://my-bucket.s3.amazonaws.com/path/file.png
      if (url.hostname.includes(".s3")) {
        const bucketName = url.hostname.split(".s3")[0];
        const objectName = url.pathname.slice(1); // remove leading "/"
        return this.deleteFromS3(bucketName, objectName);
      }
  
      // CASE 2: https://s3.amazonaws.com/my-bucket/path/file.png
      const parts = url.pathname.split("/");
      const bucketName = parts[1];
      const objectName = parts.slice(2).join("/");
      return this.deleteFromS3(bucketName, objectName);
    }
  
    // If it is a PATH like "/bucket/folder/file.png"
    const { bucketName, objectName } = parseObjectPath(objectPath);
    return this.deleteFromS3(bucketName, objectName);
  }
  

  
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.ACADEMY_PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.ACADEMY_PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set");
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
  private buildPath(relativePath: string): { bucketName: string; objectName: string } {
    const baseDir = this.getPrivateObjectDir(); // e.g. "/my-bucket-name/generacion-diplomas"
    const fullPath = `${baseDir}/${relativePath}`; // no leading slash needed in relativePath
    return parseObjectPath(fullPath);
  }
  
  async getEmptyTemplateUploadURL(year: number, fileName: string): Promise<string> {
    const { bucketName, objectName } = this.buildPath(
      `empty-templates/${year}/${fileName}`
    );
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }
  
  async getSignatureUploadURL(year: number, fileName: string): Promise<string> {
    const { bucketName, objectName } = this.buildPath(
      `signatures/${year}/${fileName}`
    );
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }
  
  async getGeneratedDiplomaUploadURL(
    generationId: number | string,
    fileName: string
  ): Promise<string> {
    const { bucketName, objectName } = this.buildPath(
      `generated-diplomas/${generationId}/${fileName}`
    );
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path");
  }
  return {
    bucketName: pathParts[1],
    objectName: pathParts.slice(2).join("/"),
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL, errorcode: ${response.status}`);
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}



