/**
 * BlobStore — media storage abstraction (architecture §6.5, §4 platform).
 *
 * The interface is the seam: Phase-1 dev uses a local-filesystem driver; the
 * prod target (GCS signed URLs) implements the same interface. Modules only ever
 * see `BlobStore`, never a concrete driver, so swapping providers is localized.
 *
 * Stored objects are addressed by an opaque `key`; `publicUrl(key)` returns the
 * URL a browser can GET. For the local driver that URL is served by the API at
 * `${PUBLIC_BASE_URL}/media/<key>`.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

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

/** Hash helper available to drivers that want content-addressable keys later. */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
