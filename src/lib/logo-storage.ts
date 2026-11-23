import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { validLogo } from "./onboarding-schema.js";

type StorageClient = { send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown> };
export type StoredLogo = { key: string; url: string };

export function logoObjectKey(businessId: string, businessName: string, extension: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(businessId)) throw new Error("Invalid business ID");
  const slug = businessName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "hotel";
  if (!["png", "jpg", "webp"].includes(extension)) throw new Error("Unsupported logo format");
  return `logo/${businessId}-${slug}/logofolder/${randomUUID()}.${extension}`;
}

export function createLogoStorage(client: StorageClient, bucket: string, publicBaseUrl: string) {
  const base = new URL(publicBaseUrl);
  if (base.protocol !== "https:" || base.search || base.hash || base.username || base.password) {
    throw new Error("R2_PUBLIC_BASE_URL must be a public HTTPS base URL");
  }
  return {
    async upload(businessId: string, businessName: string, dataUrl: string, folder: "logo" | "products" = "logo"): Promise<StoredLogo> {
      if (!validLogo(dataUrl)) throw new Error("Invalid hotel logo");
      const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl)!;
      const logoKey = logoObjectKey(businessId, businessName, match[1] === "jpeg" ? "jpg" : match[1]);
      const key = folder === "logo" ? logoKey : logoKey.replace("/logofolder/", "/products/");
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: Buffer.from(match[2], "base64"),
        ContentType: `image/${match[1]}`, CacheControl: "public, max-age=31536000, immutable",
      }));
      return { key, url: `${base.href.replace(/\/$/, "")}/${key}` };
    },
    async remove(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

let storage: ReturnType<typeof createLogoStorage> | undefined;
export function getLogoStorage() {
  if (storage) return storage;
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing ${name} for hotel logo storage`);
    return value;
  };
  const endpoint = process.env.R2_ENDPOINT?.trim() || `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
  const bucket = required("R2_BUCKET_NAME");
  const publicBaseUrl = required("R2_PUBLIC_BASE_URL");
  storage = createLogoStorage(new S3Client({
    endpoint, region: "auto", maxAttempts: 2,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  }), bucket, publicBaseUrl);
  return storage;
}
