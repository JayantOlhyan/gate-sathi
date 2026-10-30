import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { handleApiError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import {
  executeStudentImport,
  ImportValidationError,
  MAX_IMPORT_FILE_BYTES,
  previewStudentSpreadsheet,
} from '@/lib/student-import';
import { columnMappingSchema, type ColumnMapping } from '@/lib/validations';

const paramsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

const modeSchema = z.enum(['preview', 'commit']).default('commit');

const partialMappingSchema = columnMappingSchema.partial();

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
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      throw new ImportValidationError('File upload is required');
    }

    const fileName = fileEntry.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      throw new ImportValidationError('Only .csv and .xlsx files are supported');
    }

    if (fileEntry.size > MAX_IMPORT_FILE_BYTES) {
      throw new ImportValidationError('File exceeds maximum allowed size of 5 MB');
    }

    const mode = modeSchema.parse(formData.get('mode') ?? 'commit');
    const rawMappingStr = formData.get('mapping');
    let customMapping: Partial<ColumnMapping> | undefined;
    if (typeof rawMappingStr === 'string' && rawMappingStr.trim().length > 0) {
      const parsedJson = JSON.parse(rawMappingStr);
      customMapping = partialMappingSchema.parse(parsedJson);
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (mode === 'preview') {
      const preview = previewStudentSpreadsheet(buffer, customMapping);
      return NextResponse.json(preview, { status: 200 });
    }

    await connectDB();
    const report = await executeStudentImport({
      schoolId,
      userId: user.id,
      buffer,
      mapping: customMapping,
    });

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
