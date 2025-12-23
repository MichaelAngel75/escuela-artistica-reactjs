
// import { S3Client, PutObjectCommand,  } from "@aws-sdk/client-s3";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";

import { randomUUID } from "crypto";

const BUCKET_NAME = process.env.ACADEMY_S3_BUCKET || null;
const REGION = process.env.ACADEMY_AWS_REGION || null;
const HTTPS_RESOURCES_DOMAIN = process.env.ACADEMY_RESOURCES_DOMAIN || null;
const root_path = 'generacion-diplomas';

let s3Client: S3Client | null = null;

function getS3Client() {
  if (!s3Client) {
    if (!REGION) {
      console.warn("AWS region is not configured – S3 uploads will fail.");
      return null;
    }

    // Use ECS task role / instance role – no explicit credentials
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

// (getS3Client2 is redundant, but leaving it if used elsewhere)
function getS3Client2() {
  if (!s3Client) {
    if (!REGION) {
      console.warn("AWS region is not configured – S3 uploads will fail.");
      return null;
    }

    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}



export async function uploadResourceToS3(
  file: Express.Multer.File,
  fullPathPlusFileName: string
): Promise<string> {
  const client = getS3Client();

  if (!client || !BUCKET_NAME) {
    throw new Error("S3 not configured (missing region/bucket or credentials)");
  }
  if (!HTTPS_RESOURCES_DOMAIN) {
    throw new Error("ACADEMY_RESOURCES_DOMAIN must be set (CloudFront/resources domain)");
  }

  // try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fullPathPlusFileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
  
    await client.send(command);
  
    // Return CloudFront URL (or your resources domain)
    return `${HTTPS_RESOURCES_DOMAIN.replace(/\/$/, "")}/${fullPathPlusFileName}`;   
}

/**
 * Delete an image/document from S3 given its URL (HTTPS_RESOURCES_DOMAIN or raw S3 URL).
 */
export async function deleteImageFromS3(httpsResourcePathPlusFileName: string): Promise<void> {
  const client = getS3Client();

  if (!client || !BUCKET_NAME) {
    console.warn("Skipping S3 delete - S3 not configured", {
      bucket: BUCKET_NAME,
      region: REGION,
    });
    return;
  }

  let key: string | null = null;

  try {
    // Case 1: HTTPS_RESOURCES_DOMAIN-based URL, e.g. https://images.mabelsrescue.org/cats/...
    if (HTTPS_RESOURCES_DOMAIN && httpsResourcePathPlusFileName.startsWith(HTTPS_RESOURCES_DOMAIN + "/")) {
      key = httpsResourcePathPlusFileName.substring(HTTPS_RESOURCES_DOMAIN.length + 1);
    } else {
      // Case 2: direct S3 URL: https://<bucket>.s3.<region>.amazonaws.com/<key>
      const s3Prefix = `.s3.${REGION}.amazonaws.com/`;
      const idx = httpsResourcePathPlusFileName.indexOf(s3Prefix);
      if (idx !== -1) {
        key = httpsResourcePathPlusFileName.substring(idx + s3Prefix.length);
      }
    }

    if (!key) {
      console.warn("Could not infer S3 key from URL, skipping delete:", httpsResourcePathPlusFileName);
      return;
    }

    console.log("Deleting from S3", {
      bucket: BUCKET_NAME,
      region: REGION,
      key,
    });

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
  } catch (error) {
    console.error("Error deleting from S3:", error);
    // You can decide here if you want to throw or just log.
    // throw error;
  }
}

// -------------------- DELETE ENTIRE CAT FOLDER --------------------
/**
 * Deletes **all** objects under `/${prefix}/` from the main bucket.
 * Since S3 doesn't have real folders, removing all objects with that prefix
 * effectively removes the "folder".
 */
 export async function deleteFolderFromS3(prefix: string): Promise<void> {
  const client = getS3Client();

  if (!client || !BUCKET_NAME) {
    console.warn("Skipping cat folder deletion - S3 not configured", {
      bucket: BUCKET_NAME,
      region: REGION,
    });
    return;
  }

  console.log("Deleting S3 folder for all root path: ", { bucket: BUCKET_NAME, prefix });

  let continuationToken: string | undefined = undefined;

  try {
    do {
      const listResp = await client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      const objects = listResp.Contents ?? [];
      if (objects.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: {
              Objects: objects.map((o) => ({ Key: o.Key! })),
              Quiet: true,
            },
          })
        );
      }

      continuationToken = listResp.IsTruncated
        ? listResp.NextContinuationToken
        : undefined;
    } while (continuationToken);
  } catch (err) {
    console.error("Error deleting cat folder from S3:", err);
  }
}


export function buildTemplateKey(originalFilename: string) {
  // empty-templates/YYYY-MM-DD/HH-MM-SS/<whateverfileName>.pdf
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");

  // Keep original name but ensure ".pdf"
  const safeName = originalFilename.replace(/[^\w.\-]+/g, "_");
  const fileName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;

  return `${root_path}/empty-templates/${yyyy}-${mm}-${dd}/${HH}-${MM}-${SS}/${fileName}`;
}

export function buildSignatureKey(originalFilename: string) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  // const HH = String(now.getHours()).padStart(2, "0");
  // const MM = String(now.getMinutes()).padStart(2, "0");
  // const SS = String(now.getSeconds()).padStart(2, "0");

  const safeName = originalFilename.replace(/[^\w.\-]+/g, "_");
  // return `${root_path}/signatures/${yyyy}-${mm}-${dd}/${HH}-${MM}-${SS}/${safeName}`;
  return `${root_path}/signatures/${yyyy}-${mm}-${dd}/${safeName}`;
}

export function buildGeneratedDiplomasCsvKey(originalFilename: string, idProceso: number) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const safeName = originalFilename.replace(/[^\w.\-]+/g, "_");
  const fileName = safeName.toLowerCase().endsWith(".csv") ? safeName : `${safeName}.csv`;

  return `${root_path}/generated-diplomas/${yyyy}-${mm}-${dd}/proceso-${idProceso}/${fileName}`;
}

export function extractParentPrefixFromUrl(input: string): string | null {
  if (!input) return null;

  let path: string;

  // Case 1: raw S3 key (no protocol)
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    path = input;
  } else {
    try {
      const u = new URL(input);
      path = u.pathname;
    } catch {
      return null;
    }
  }

  // Normalize
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");

  // Split and remove filename
  const parts = path.split("/");
  if (parts.length <= 1) return null;

  parts.pop(); // remove filename

  return parts.join("/");
}
