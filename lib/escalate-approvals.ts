import { Types } from 'mongoose';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { School } from '@/models/School';
import { writeAuditLog } from '@/lib/audit';
import { sendNotificationToSchoolPrincipals } from '@/lib/push';

export async function checkAndEscalatePendingRequests(
  schoolId?: Types.ObjectId | string
): Promise<number> {
  const query: Record<string, unknown> = {
    status: 'pending',
  };
  if (schoolId) {
    query.schoolId = new Types.ObjectId(schoolId);
  }

  const pendingRequests = await ApprovalRequest.find(query).populate('studentId', 'name');
  if (pendingRequests.length === 0) return 0;

  const now = Date.now();
  let escalatedCount = 0;

  for (const req of pendingRequests) {
    const school = await School.findById(req.schoolId).lean();
    const escalationMinutes = school?.teacherApprovalEscalationMinutes ?? 5;
    const cutoffTime = new Date(req.createdAt).getTime() + escalationMinutes * 60 * 1000;

    if (now >= cutoffTime) {
      req.status = 'escalated';
      req.escalatedAt = new Date();
      await req.save();
      escalatedCount++;

      await writeAuditLog({
        schoolId: req.schoolId,
        userId: req.requestedBy,
        action: 'approval.escalate',
        entityType: 'ApprovalRequest',
        entityId: req._id,
        metadata: {
          visitId: String(req.visitId),
          studentId: String((req.studentId as any)?._id || req.studentId),
          escalatedAt: req.escalatedAt,
        },
      });

      const studentName = (req.studentId as any)?.name || 'Student';
      await sendNotificationToSchoolPrincipals(req.schoolId, {
        title: 'Escalated Visitor Approval',
        body: `Approval for ${studentName} pending over ${escalationMinutes}m. Action required.`,
        url: '/dashboard',
      });
    }
  }

  return escalatedCount;
}
