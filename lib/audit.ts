import { Types } from 'mongoose';
import { AuditLog } from '@/models/AuditLog';

export async function writeAuditLog(params: {
  schoolId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: string | Types.ObjectId;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  const validUserId = Types.ObjectId.isValid(String(params.userId))
    ? new Types.ObjectId(String(params.userId))
    : new Types.ObjectId();

  const validEntityId =
    params.entityId && Types.ObjectId.isValid(String(params.entityId))
      ? new Types.ObjectId(String(params.entityId))
      : undefined;

  await AuditLog.create({
    schoolId: new Types.ObjectId(String(params.schoolId)),
    userId: validUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: validEntityId,
    metadata: params.metadata,
    ipAddress: params.ipAddress,
  });
}
