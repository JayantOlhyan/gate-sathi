import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RbacError } from '@/lib/rbac';

export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/webp',
] as const;

export type AllowedUploadContentType =
  (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number];

export const MAX_UPLOAD_BYTES = 1024 * 1024; // 1 MB
export const SIGNED_PUT_EXPIRY_SECONDS = 5 * 60; // 5 minutes
export const SIGNED_GET_EXPIRY_SECONDS = 10 * 60; // 10 minutes

export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID || 'local-dev-account';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || 'local-dev-access-key';
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY || 'local-dev-secret-key';

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function getR2BucketName(): string {
  return process.env.R2_BUCKET || 'gatesathi-private';
}

export async function createPresignedPutUrl(params: {
  schoolId: string;
  contentType: AllowedUploadContentType;
  contentLength: number;
}): Promise<{ uploadUrl: string; photoKey: string }> {
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(params.contentType)) {
    throw new RbacError(
      'Invalid content-type; only image/jpeg and image/webp are allowed',
      400
    );
  }

  if (params.contentLength <= 0 || params.contentLength > MAX_UPLOAD_BYTES) {
    throw new RbacError('Photo file size must be between 1 byte and 1 MB', 400);
  }

  const uuid = crypto.randomUUID();
  const photoKey = `${params.schoolId}/visitors/${uuid}.jpg`;

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: photoKey,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: SIGNED_PUT_EXPIRY_SECONDS,
    signableHeaders: new Set(['content-type', 'content-length']),
  });

  return { uploadUrl, photoKey };
}

export async function createPresignedGetUrl(params: {
  schoolId: string;
  photoKey: string;
}): Promise<string> {
  const expectedPrefix = `${params.schoolId}/`;
  if (!params.photoKey.startsWith(expectedPrefix)) {
    throw new RbacError(
      'Forbidden: photoKey does not belong to the authorized school',
      403
    );
  }

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getR2BucketName(),
    Key: params.photoKey,
  });

  return await getSignedUrl(client, command, {
    expiresIn: SIGNED_GET_EXPIRY_SECONDS,
  });
}

export interface HeadObjectMetadata {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}

export type HeadObjectInspector = (
  key: string
) => Promise<HeadObjectMetadata>;

let customHeadObjectInspector: HeadObjectInspector | null = null;

export function setHeadObjectInspector(
  inspector: HeadObjectInspector | null
): void {
  customHeadObjectInspector = inspector;
}

export async function headPhotoObject(
  photoKey: string
): Promise<HeadObjectMetadata> {
  if (customHeadObjectInspector) {
    return await customHeadObjectInspector(photoKey);
  }

  try {
    const client = getR2Client();
    const res = await client.send(
      new HeadObjectCommand({
        Bucket: getR2BucketName(),
        Key: photoKey,
      })
    );
    return {
      exists: true,
      contentLength: res.ContentLength,
      contentType: res.ContentType,
    };
  } catch {
    return { exists: false };
  }
}

export async function verifyUploadedPhotoKey(params: {
  schoolId: string;
  photoKey: string;
}): Promise<void> {
  const expectedPrefix = `${params.schoolId}/`;
  if (!params.photoKey.startsWith(expectedPrefix)) {
    throw new RbacError(
      'Invalid photoKey: must start with the authorized schoolId prefix',
      400
    );
  }

  const meta = await headPhotoObject(params.photoKey);
  if (!meta.exists) {
    throw new RbacError(
      'Invalid photoKey: uploaded object does not exist in storage',
      400
    );
  }

  const size = meta.contentLength ?? 0;
  if (size <= 0 || size > MAX_UPLOAD_BYTES) {
    throw new RbacError(
      'Invalid photoKey: uploaded object size must be between 1 byte and 1 MB',
      400
    );
  }
}

export async function checkR2Health(): Promise<'ok' | 'error'> {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return 'error';
  }

  try {
    const client = getR2Client();
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return 'ok';
  } catch {
    return 'error';
  }
}
