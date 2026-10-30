import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { gateExitVisitBodySchema, objectIdSchema } from '@/lib/validations';
import { Visit } from '@/models/Visit';

const paramsSchema = z.object({
  visitId: objectIdSchema,
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ visitId: string }> }
) {
  try {
    const user = await requireRole('guard', 'principal', 'super_admin');
    const { visitId } = paramsSchema.parse(await context.params);

    const rawBody = await req.json();
    const body = gateExitVisitBodySchema.parse(rawBody);
    const { schoolId } = await requireSchoolAccess(body.schoolId);

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const visitObjectId = new Types.ObjectId(visitId);
    const checkedOutByObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    const now = new Date();
    const updatedVisit = await Visit.findOneAndUpdate(
      {
        _id: visitObjectId,
        schoolId: schoolObjectId,
        exitAt: null,
      },
      {
        $set: {
          exitAt: now,
          leftWithStudent: Boolean(body.leftWithStudent),
          checkedOutBy: checkedOutByObjectId,
        },
      },
      { new: true }
    );

    if (!updatedVisit) {
      return NextResponse.json(
        { error: 'Open visit not found for this school' },
        { status: 404 }
      );
    }

    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: checkedOutByObjectId,
      action: 'visit.exit',
      entityType: 'Visit',
      entityId: updatedVisit._id,
      metadata: {
        leftWithStudent: updatedVisit.leftWithStudent,
        exitAt: updatedVisit.exitAt,
      },
    });

    return NextResponse.json({ visit: updatedVisit }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
