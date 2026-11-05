import { Types } from 'mongoose';
import { ApprovalRequest, type IApprovalRequest } from '@/models/ApprovalRequest';
import { School, type ISchool } from '@/models/School';
import { User } from '@/models/User';
import { Student } from '@/models/Student';
import { writeAuditLog } from '@/lib/audit';
import { notify } from '@/lib/push';

/**
 * Checks for overdue pending approval requests and atomically escalates them.
 * Safe under concurrent invocations: uses atomic findOneAndUpdate with status: 'pending'.
 * Only the caller that wins the update sends the notification and writes the audit log.
 */
export async function checkAndEscalatePendingRequests(
  schoolId?: Types.ObjectId | string
): Promise<number> {
  const query: Record<string, unknown> = {
    status: 'pending',
  };
  if (schoolId) {
    query.schoolId = new Types.ObjectId(String(schoolId));
  }

  // Initial candidate scan
  const candidates = await ApprovalRequest.find(query)
    .select('_id schoolId studentId visitId requestedBy createdAt')
    .lean();

  if (candidates.length === 0) return 0;

  // Cache School lookups per run
  const schoolCache = new Map<string, ISchool | null>();
  async function getSchool(sId: Types.ObjectId): Promise<ISchool | null> {
    const key = String(sId);
    if (schoolCache.has(key)) {
      return schoolCache.get(key)!;
    }
    const schoolDoc = await School.findById(sId).lean();
    schoolCache.set(key, schoolDoc as ISchool | null);
    return schoolDoc as ISchool | null;
  }

  const nowMs = Date.now();
  let escalatedCount = 0;

  for (const candidate of candidates) {
    const school = await getSchool(candidate.schoolId);
    const escalationMinutes = school?.teacherApprovalEscalationMinutes ?? 5;
    const cutoffDate = new Date(nowMs - escalationMinutes * 60 * 1000);

    if (new Date(candidate.createdAt).getTime() > cutoffDate.getTime()) {
      continue;
    }

    // Atomic update to win the escalation race
    const updated = await ApprovalRequest.findOneAndUpdate(
      {
        _id: candidate._id,
        status: 'pending',
        createdAt: { $lte: cutoffDate },
      },
      {
        $set: {
          status: 'escalated',
          escalatedAt: new Date(),
        },
      },
      { new: true }
    );

    // If another concurrent call already updated it, skip
    if (!updated) {
      continue;
    }

    escalatedCount++;

    await writeAuditLog({
      schoolId: updated.schoolId,
      userId: updated.requestedBy,
      action: 'approval.escalate',
      entityType: 'ApprovalRequest',
      entityId: updated._id,
      metadata: {
        visitId: String(updated.visitId),
        studentId: String(updated.studentId),
        escalatedAt: updated.escalatedAt,
      },
    });

    // Lookup student name and principal user IDs
    try {
      const student = await Student.findById(updated.studentId).select('name').lean();
      const studentName = student?.name || 'Student';

      const principals = await User.find({
        schoolIds: updated.schoolId,
        role: 'principal',
        isActive: true,
      })
        .select('_id')
        .lean();

      if (principals.length > 0) {
        const principalIds = principals.map((p) => p._id);
        const dedupeKey = `approval_escalated:${String(updated._id)}`;
        await notify(
          principalIds,
          'approval_escalated',
          {
            title: 'Escalated Visitor Approval',
            body: `Approval for ${studentName} pending over ${escalationMinutes}m. Action required.`,
            url: '/dashboard',
          },
          dedupeKey,
          { schoolId: updated.schoolId }
        );
      }
    } catch (pushErr) {
      console.warn('[Push] Error sending escalation notification:', pushErr);
    }
  }

  return escalatedCount;
}

/**
 * Checks for stale pending/escalated approval requests older than school limit (default 30 min)
 * and transitions them to 'expired'.
 * Writes an audit log for every expired request.
 */
export async function checkAndExpireStaleRequests(
  schoolId?: Types.ObjectId | string
): Promise<number> {
  const query: Record<string, unknown> = {
    status: { $in: ['pending', 'escalated'] },
  };
  if (schoolId) {
    query.schoolId = new Types.ObjectId(String(schoolId));
  }

  const candidates = await ApprovalRequest.find(query)
    .select('_id schoolId studentId visitId requestedBy status createdAt')
    .lean();

  if (candidates.length === 0) return 0;

  const schoolCache = new Map<string, ISchool | null>();
  async function getSchool(sId: Types.ObjectId): Promise<ISchool | null> {
    const key = String(sId);
    if (schoolCache.has(key)) {
      return schoolCache.get(key)!;
    }
    const schoolDoc = await School.findById(sId).lean();
    schoolCache.set(key, schoolDoc as ISchool | null);
    return schoolDoc as ISchool | null;
  }

  const nowMs = Date.now();
  let expiredCount = 0;

  for (const candidate of candidates) {
    const school = await getSchool(candidate.schoolId);
    const expiryMinutes = school?.teacherApprovalExpiryMinutes ?? 30;
    const cutoffDate = new Date(nowMs - expiryMinutes * 60 * 1000);

    if (new Date(candidate.createdAt).getTime() > cutoffDate.getTime()) {
      continue;
    }

    // Atomic update
    const updated = await ApprovalRequest.findOneAndUpdate(
      {
        _id: candidate._id,
        status: { $in: ['pending', 'escalated'] },
        createdAt: { $lte: cutoffDate },
      },
      {
        $set: {
          status: 'expired',
        },
      },
      { new: true }
    );

    if (!updated) {
      continue;
    }

    expiredCount++;

    await writeAuditLog({
      schoolId: updated.schoolId,
      userId: updated.requestedBy,
      action: 'approval.expire',
      entityType: 'ApprovalRequest',
      entityId: updated._id,
      metadata: {
        visitId: String(updated.visitId),
        studentId: String(updated.studentId),
        previousStatus: candidate.status,
        expiredAfterMinutes: expiryMinutes,
      },
    });
  }

  return expiredCount;
}
