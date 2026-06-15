/**
 * BlobStore — media storage abstraction (architecture §6.5, §4 platform).
 *
 * The interface is the seam: dev uses a local-filesystem driver; production uses
 * an S3-compatible bucket (Supabase Storage / Cloudflare R2). Modules only ever
 * see `BlobStore`, never a concrete driver, so swapping providers is localized.
 *
 * Stored objects are addressed by an opaque `key`; `publicUrl(key)` returns the
 * URL a browser can GET. For the local driver that URL is served by the API at
 * `${PUBLIC_BASE_URL}/media/<key>`; for the S3 driver it is the bucket's public
 * base URL + key.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface PutResult {
  key: string;
  url: string;
}

export interface BlobStore {
  /** Store bytes under a generated key in `prefix/`; return key + public URL. */
  put(
    prefix: string,
    data: Buffer,
    contentType: string,
    originalName?: string,
  ): Promise<PutResult>;
  /** Public URL for a previously stored key. */
  publicUrl(key: string): string;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXT_BY_TYPE);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function safeExt(contentType: string, originalName?: string): string {
  const byType = EXT_BY_TYPE[contentType];
  if (byType) return byType;
  if (originalName) {
    const e = extname(originalName).toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(e)) return e;
  }
  return "";
}

/** Local-filesystem BlobStore: writes under STORAGE_LOCAL_DIR, served via /media. */
export class LocalBlobStore implements BlobStore {
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;

  constructor(rootDir: string, publicBaseUrl: string) {
    this.rootDir = resolve(rootDir);
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
  }

  /** Absolute root directory where blobs live (used to mount @fastify/static). */
  get root(): string {
    return this.rootDir;
  }

  async put(
    prefix: string,
    data: Buffer,
    contentType: string,
    originalName?: string,
  ): Promise<PutResult> {
    const ext = safeExt(contentType, originalName);
    // content-addressable-ish: uuid keeps writes collision-free.
    const id = `${randomUUID()}${ext}`;
    const key = `${prefix.replace(/^\/+|\/+$/g, "")}/${id}`;
    const dest = join(this.rootDir, key);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, data);
    return { key, url: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/media/${key}`;
  }
}

export interface S3BlobStoreOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL the bucket serves objects from (no trailing slash needed). */
  publicBaseUrl: string;
}

/**
 * S3-compatible BlobStore (Supabase Storage, Cloudflare R2, AWS S3, MinIO).
 * Uploads via the S3 API and returns the bucket's public URL for each object.
 * Path-style addressing is forced — required by Supabase/R2/MinIO.
 */
export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(opts: S3BlobStoreOptions) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
    this.bucket = opts.bucket;
    this.publicBaseUrl = opts.publicBaseUrl.replace(/\/+$/, "");
  }

  async put(
    prefix: string,
    data: Buffer,
    contentType: string,
    originalName?: string,
  ): Promise<PutResult> {
    const ext = safeExt(contentType, originalName);
    const id = `${randomUUID()}${ext}`;
    const key = `${prefix.replace(/^\/+|\/+$/g, "")}/${id}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        // Media is immutable (uuid keys), so let browsers/CDNs cache forever.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: this.publicUrl(key) };
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.replace(/^\/+/, "")}`;
  }
}

/** Hash helper available to drivers that want content-addressable keys later. */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
