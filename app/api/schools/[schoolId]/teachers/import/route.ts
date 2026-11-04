import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { connectDB } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { indianPhoneSchema } from '@/lib/validations';
import { User } from '@/models/User';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const rawParams = await context.params;
    const { schoolId: requestedSchoolId } = paramsSchema.parse(rawParams);

    const user = await requireRole('principal', 'super_admin');
    const { schoolId } = await requireSchoolAccess(requestedSchoolId);

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as Blob).arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: 'File has no sheets' }, { status: 400 });
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json({ error: 'Sheet could not be read' }, { status: 400 });
    }
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    await connectDB();

    const schoolObjectId = new Types.ObjectId(schoolId);
    const callerObjectId = Types.ObjectId.isValid(user.id)
      ? new Types.ObjectId(user.id)
      : new Types.ObjectId();

    let createdCount = 0;
    let updatedCount = 0;
    let conflictCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    const defaultPasswordHash = await bcrypt.hash('Password@123', 10);

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row) continue;
      const name = String(row.name || row.Name || row['Teacher Name'] || '').trim();
      const phoneRaw = String(row.phone || row.Phone || row['Mobile'] || '').replace(/\D/g, '');
      const className = String(row.className || row.Class || row.class || '').trim();
      const section = String(row.section || row.Section || 'A').trim().toUpperCase();

      const phoneResult = indianPhoneSchema.safeParse(phoneRaw);
      if (!name || !phoneResult.success || !className) {
        errors.push({
          row: i + 2,
          error: `Invalid row: name, 10-digit phone, and className are required.`,
        });
        continue;
      }

      const phone = phoneResult.data;
      const existingUser = await User.findOne({ phone });

      const newAssignment = {
        schoolId: schoolObjectId,
        className,
        section,
      };

      if (existingUser) {
        if (normalizeName(existingUser.name) !== normalizeName(name)) {
          conflictCount++;
          errors.push({
            row: i + 2,
            error: `Conflict: Phone ${phone} is already registered under name "${existingUser.name}".`,
          });
          continue;
        }

        if (!existingUser.schoolIds.some((sId) => String(sId) === schoolId)) {
          existingUser.schoolIds.push(schoolObjectId);
        }

        if (existingUser.role !== 'super_admin' && existingUser.role !== 'principal') {
          existingUser.role = 'teacher';
        }

        const assignments = existingUser.classAssignments || [];
        const isDuplicate = assignments.some(
          (ca) =>
            String(ca.schoolId) === schoolId &&
            ca.className === className &&
            ca.section === section
        );

        if (!isDuplicate) {
          assignments.push(newAssignment as any);
          existingUser.classAssignments = assignments;
        }

        existingUser.isActive = true;
        await existingUser.save();
        updatedCount++;
      } else {
        await User.create({
          name,
          phone,
          passwordHash: defaultPasswordHash,
          role: 'teacher',
          schoolIds: [schoolObjectId],
          classAssignments: [newAssignment],
          tokenVersion: 0,
          isActive: true,
        });
        createdCount++;
      }
    }

    await writeAuditLog({
      schoolId: schoolObjectId,
      userId: callerObjectId,
      action: 'teacher.bulk_import',
      entityType: 'User',
      metadata: {
        createdCount,
        updatedCount,
        conflictCount,
        totalRows: rawRows.length,
      },
    });

    return NextResponse.json(
      {
        createdCount,
        updatedCount,
        conflictCount,
        errors,
        totalProcessed: rawRows.length,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
