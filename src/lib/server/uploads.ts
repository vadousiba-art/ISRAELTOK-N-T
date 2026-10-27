import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import { demoDataDir, uploadConfig } from "@/lib/config";

export const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT).map(([mime, ext]) => [ext, mime]),
);

export function mediaKind(mime: string): "image" | "video" | "gif" | null {
  if (mime === "image/gif") return "gif";
  if (uploadConfig.imageTypes.includes(mime)) return "image";
  if (uploadConfig.videoTypes.includes(mime)) return "video";
  return null;
}

export function maxBytesFor(mime: string) {
  return mediaKind(mime) === "video" ? uploadConfig.maxVideoBytes : uploadConfig.maxImageBytes;
}

// Check the file's leading bytes against the declared type, so a renamed
// executable or HTML file cannot be uploaded as an "image".
export function sniffMatches(mime: string, head: Uint8Array): boolean {
  const s = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  switch (mime) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head[0] === 0x89 && s(1, 4) === "PNG";
    case "image/gif":
      return s(0, 4) === "GIF8";
    case "image/webp":
      return s(0, 4) === "RIFF" && s(8, 12) === "WEBP";
    case "video/mp4":
    case "video/quicktime":
      return s(4, 8) === "ftyp" || s(4, 8) === "moov" || s(4, 8) === "mdat" || s(4, 8) === "wide";
    case "video/webm":
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    default:
      return false;
  }
}

export function newUploadPath(userId: string, mime: string) {
  return `u/${userId}/${crypto.randomUUID()}.${EXT[mime]}`;
}

// u/<user>/<file> in the original project, or s<n>/u/<user>/<file> in project n.
export const UPLOAD_PATH_RE = /^(s[1-7]\/)?u\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/;

export function demoUploadFile(p: string) {
  if (!UPLOAD_PATH_RE.test(p) || !p.startsWith("u/")) throw new Error("bad path");
  return path.join(/*turbopackIgnore: true*/ process.cwd(), demoDataDir(), "uploads", p);
}

const g = globalThis as unknown as { __itnUploadSecret?: string };
const secret = () => (g.__itnUploadSecret ??= process.env.DEMO_UPLOAD_SECRET ?? crypto.randomBytes(32).toString("hex"));

export function signDemoUpload(p: string, mime: string, exp: number) {
  return crypto.createHmac("sha256", secret()).update(`${p}|${mime}|${exp}`).digest("hex");
}

export function verifyDemoUpload(p: string, mime: string, exp: number, sig: string) {
  if (Date.now() > exp) return false;
  const expected = Buffer.from(signDemoUpload(p, mime, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// Before an uploaded path is attached to a post, story, message or avatar:
// it must be the caller's own upload, and with Supabase Storage (where the
// browser uploads directly) the stored bytes must match the declared type.
// The demo upload endpoint already checks bytes on the way in.
const verified = new Set<string>();

export function uploadPathsIn(fn: string, args: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => typeof v === "string" && UPLOAD_PATH_RE.test(v) && out.push(v);
  add(args.p_media_url);
  if (fn === "update_my_profile" && args.p && typeof args.p === "object") add((args.p as Record<string, unknown>).avatar_url);
  return out;
}

export async function verifyUploads(
  paths: string[],
  userId: string,
  sniffRemote: ((path: string) => Promise<Uint8Array | null>) | null,
): Promise<string | null> {
  for (const p of paths) {
    if (!p.replace(/^s[1-7]\//, "").startsWith(`u/${userId}/`)) return "That file belongs to someone else's upload.";
    if (!sniffRemote || verified.has(p)) continue;
    let head: Uint8Array | null;
    try {
      head = await sniffRemote(p);
    } catch (err) {
      // Storage briefly unreachable: do not block posting over it. The bucket
      // still enforces the declared type and size limits.
      console.warn("[yoru] could not check an upload's contents:", (err as Error).message);
      continue;
    }
    if (!head) return "That upload could not be found. Please try again.";
    const mime = MIME_BY_EXT[p.split(".").pop()!];
    // Rejected files are left alone (never delete from a request path); the
    // abandoned-upload cleanup removes files nothing refers to.
    if (!mime || !sniffMatches(mime, head)) return "That file is not what it claims to be.";
    verified.add(p);
    if (verified.size > 5000) verified.clear();
  }
  return null;
}
