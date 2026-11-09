import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { badRequest } from '../../lib/errors.js';

export const PHOTO_BUCKET = 'incident-photos';

// ---------------------------------------------------------------------------
// Image checks and metadata removal
// ---------------------------------------------------------------------------

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** JPEG or PNG by their magic bytes; anything else is refused. */
export function detectImageType(buffer) {
  if (buffer.length > 3 && buffer.subarray(0, 2).equals(JPEG_SOI) && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  return null;
}

// JPEG segments kept: APP0 (JFIF), APP2 (ICC colour profile), APP14 (Adobe
// colour transform) and everything the decoder needs. Dropped: APP1 (EXIF with
// GPS position, camera and time; XMP), other APPn and comments.
const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw badRequest('The photo is not a valid JPEG image');
    let marker = buf[i + 1];
    // Fill bytes before a marker.
    while (marker === 0xff) {
      i += 1;
      marker = buf[i + 1];
    }
    if (marker === undefined) throw badRequest('The photo is not a valid JPEG image');
    // Standalone markers have no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      break;
    }
    if (i + 4 > buf.length) throw badRequest('The photo is not a valid JPEG image');
    const length = buf.readUInt16BE(i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > buf.length) throw badRequest('The photo is not a valid JPEG image');
    if (marker === 0xda) {
      // Start of scan: the compressed image data follows until the end.
      out.push(buf.subarray(i));
      break;
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!(isApp && !KEEP_APP.has(marker)) && !isComment) out.push(buf.subarray(i, end));
    i = end;
  }
  return Buffer.concat(out);
}

// PNG chunks dropped: text (may hold location or device names), EXIF, time.
const DROP_PNG = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buf.length) throw badRequest('The photo is not a valid PNG image');
    if (!DROP_PNG.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

/**
 * Checks the upload is a JPEG or PNG and removes the metadata that could
 * identify an anonymous reporter (GPS position, device, owner name, time).
 */
export function cleanPhoto(buffer) {
  const contentType = detectImageType(buffer);
  if (!contentType) throw badRequest('Send the photo as a JPEG or PNG image');
  const cleaned = contentType === 'image/jpeg' ? stripJpeg(buffer) : stripPng(buffer);
  return { buffer: cleaned, contentType };
}

// ---------------------------------------------------------------------------
// Where photos are kept
// ---------------------------------------------------------------------------

/**
 * Supabase Storage (proposal: file storage for incident photos) when the
 * service-role key is configured; otherwise a local folder in development.
 * Without either, photo upload reports "not configured" instead of failing silently.
 */
export function createPhotoStorage(config, { fetchImpl = fetch } = {}) {
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    const base = `${config.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${PHOTO_BUCKET}`;
    const headers = {
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
    };
    return {
      configured: true,
      kind: 'supabase',
      async put(objectPath, buffer, contentType) {
        const res = await fetchImpl(`${base}/${objectPath}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'false' },
          body: buffer,
        });
        if (!res.ok) throw new Error(`Supabase Storage upload failed (${res.status})`);
      },
      async get(objectPath) {
        const res = await fetchImpl(`${base}/${objectPath}`, { headers });
        if (res.status === 404 || res.status === 400) return null;
        if (!res.ok) throw new Error(`Supabase Storage download failed (${res.status})`);
        return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg' };
      },
    };
  }

  const dir = config.PHOTO_STORAGE_DIR;
  if (dir && !config.isProduction) {
    const root = path.resolve(dir);
    const resolve = (objectPath) => {
      const full = path.resolve(root, objectPath);
      if (!full.startsWith(root + path.sep)) throw new Error('Invalid photo path');
      return full;
    };
    return {
      configured: true,
      kind: 'local',
      async put(objectPath, buffer) {
        const full = resolve(objectPath);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, buffer, { flag: 'wx' });
      },
      async get(objectPath) {
        try {
          const buffer = await readFile(resolve(objectPath));
          return { buffer, contentType: detectImageType(buffer) ?? 'application/octet-stream' };
        } catch (err) {
          if (err.code === 'ENOENT') return null;
          throw err;
        }
      },
    };
  }

  return {
    configured: false,
    kind: 'none',
    async put() {
      throw new Error('Photo storage is not configured');
    },
    async get() {
      return null;
    },
  };
}

/** In-memory storage for tests. */
export function createMemoryPhotoStorage() {
  const objects = new Map();
  return {
    configured: true,
    kind: 'memory',
    objects,
    async put(objectPath, buffer, contentType) {
      if (objects.has(objectPath)) throw new Error('exists');
      objects.set(objectPath, { buffer, contentType });
    },
    async get(objectPath) {
      return objects.get(objectPath) ?? null;
    },
  };
}
