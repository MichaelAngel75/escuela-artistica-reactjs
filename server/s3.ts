import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION;
const bucket = process.env.ACADEMY_S3_BUCKET;
const root_path = 'generacion-diplomas';

if (!region) throw new Error("AWS_REGION must be set");
if (!bucket) throw new Error("ACADEMY_S3_BUCKET must be set");

export const s3 = new S3Client({ region });

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

export async function uploadPdfToS3(params: {
  key: string;
  body: Buffer;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: "application/pdf",
    }),
  );

  // Store a stable reference in DB (not a presigned URL)
  return `s3://${bucket}/${params.key}`;
}

export async function deleteS3ObjectByUrl(url: string) {
  // url is stored like s3://bucket/key
  const match = url.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) return;

  const [, b, key] = match;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: b,
      Key: key,
    }),
  );
}

export async function presignGetUrlByS3Url(url: string, expiresSeconds = 300) {
  const match = url.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`Invalid S3 url format: ${url}`);

  const [, b, key] = match;

  const signed = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: b,
      Key: key,
    }),
    { expiresIn: expiresSeconds },
  );

  return signed;
}
