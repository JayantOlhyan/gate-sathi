import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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
  });

  return { uploadUrl, photoKey };
}

export async function createPresignedGetUrl(params: {
  schoolId: string;
  photoKey: string;
}): Promise<string> {
  const expectedPrefix = `${params.schoolId}/visitors/`;
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
