import * as XLSX from 'xlsx';
import { Types } from 'mongoose';
import { Student } from '@/models/Student';
import { writeAuditLog } from '@/lib/audit';
import {
  columnMappingSchema,
  studentImportRowSchema,
  type ColumnMapping,
} from '@/lib/validations';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 5000;
export const PREVIEW_ROW_LIMIT = 20;
export const BULK_WRITE_CHUNK_SIZE = 500;

export class ImportValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  admissionNo: [
    'admissionno',
    'admission_no',
    'admission number',
    'admissionnumber',
    'srno',
    'प्रवेश संख्या',
    'प्रवेश क्रमांक',
    'दाखिला संख्या',
  ],
  name: [
    'name',
    'studentname',
    'student_name',
    'student name',
    'नाम',
    'छात्र का नाम',
    'विद्यार्थी का नाम',
  ],
  className: [
    'classname',
    'class_name',
    'class',
    'standard',
    'grade',
    'कक्षा',
    'दर्जा',
  ],
  section: ['section', 'sec', 'वर्ग', 'सेक्शन', 'अनुभाग'],
  rollNumber: [
    'rollnumber',
    'roll_number',
    'roll no',
    'rollno',
    'roll',
    'रोल नंबर',
    'अनुक्रमांक',
  ],
};

export function autoDetectColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const normalizedMap = new Map<string, string>();

  for (const h of headers) {
    normalizedMap.set(h.trim().toLowerCase(), h);
  }

  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS) as Array<
    [keyof ColumnMapping, string[]]
  >) {
    for (const syn of synonyms) {
      const original = normalizedMap.get(syn.toLowerCase());
      if (original) {
        mapping[field] = original;
        break;
      }
    }
  }

  return mapping;
}

export function parseSpreadsheetBuffer(buffer: Buffer): {
  headers: string[];
  rawRows: Array<Record<string, string>>;
} {
  if (buffer.byteLength === 0) {
    throw new ImportValidationError('Uploaded file is empty');
  }
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new ImportValidationError('File exceeds maximum allowed size of 5 MB');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new ImportValidationError('No worksheet found in uploaded file');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new ImportValidationError('Worksheet could not be read');
  }

  const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) {
    throw new ImportValidationError('Spreadsheet contains no header row');
  }

  const headers = (matrix[0] ?? [])
    .map((cell) => String(cell ?? '').trim())
    .filter(Boolean);
  if (headers.length === 0) {
    throw new ImportValidationError('Spreadsheet header row is empty');
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ImportValidationError(
      `Spreadsheet has ${dataRows.length} rows, exceeding maximum of ${MAX_IMPORT_ROWS} rows`
    );
  }

  const rawRows: Array<Record<string, string>> = dataRows.map((rowArr) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = String(rowArr[idx] ?? '').trim();
    });
    return obj;
  });

  return { headers, rawRows };
}

export interface MappedPreviewRow {
  rowNumber: number;
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  rollNumber: string;
}

export function previewStudentSpreadsheet(
  buffer: Buffer,
  customMapping?: Partial<ColumnMapping>
): {
  headers: string[];
  suggestedMapping: Partial<ColumnMapping>;
  totalRows: number;
  previewRows: MappedPreviewRow[];
} {
  const { headers, rawRows } = parseSpreadsheetBuffer(buffer);
  const autoMapping = autoDetectColumnMapping(headers);
  const effectiveMapping: Partial<ColumnMapping> = {
    ...autoMapping,
    ...Object.fromEntries(
      Object.entries(customMapping ?? {}).filter(([, val]) => Boolean(val))
    ),
  };

  const previewRows: MappedPreviewRow[] = rawRows
    .slice(0, PREVIEW_ROW_LIMIT)
    .map((row, idx) => ({
      rowNumber: idx + 2,
      admissionNo: effectiveMapping.admissionNo
        ? (row[effectiveMapping.admissionNo] ?? '')
        : '',
      name: effectiveMapping.name ? (row[effectiveMapping.name] ?? '') : '',
      className: effectiveMapping.className
        ? (row[effectiveMapping.className] ?? '')
        : '',
      section: effectiveMapping.section ? (row[effectiveMapping.section] ?? '') : '',
      rollNumber: effectiveMapping.rollNumber
        ? (row[effectiveMapping.rollNumber] ?? '')
        : '',
    }));

  return {
    headers,
    suggestedMapping: effectiveMapping,
    totalRows: rawRows.length,
    previewRows,
  };
}

export interface ImportRowReport {
  rowNumber: number;
  admissionNo: string;
  name: string;
  status: 'created' | 'updated' | 'failed';
  reason: string;
}

export interface ImportExecutionSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  rows: ImportRowReport[];
  reportCsv: string;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildImportReportCsv(rows: ImportRowReport[]): string {
  const header = ['rowNumber', 'admissionNo', 'name', 'status', 'reason'].join(',');
  const lines = rows.map((r) =>
    [
      String(r.rowNumber),
      escapeCsvCell(r.admissionNo),
      escapeCsvCell(r.name),
      r.status,
      escapeCsvCell(r.reason),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

interface ValidatedImportRow {
  rowNumber: number;
  reportIndex: number;
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  rollNumber: string;
}

interface BulkWriteErrorItem {
  index: number;
  errmsg?: string;
  message?: string;
}

export async function executeStudentImport(params: {
  schoolId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  buffer: Buffer;
  mapping?: Partial<ColumnMapping>;
}): Promise<ImportExecutionSummary> {
  const { headers, rawRows } = parseSpreadsheetBuffer(params.buffer);
  const detected = autoDetectColumnMapping(headers);
  const mergedMapping = {
    ...detected,
    ...Object.fromEntries(
      Object.entries(params.mapping ?? {}).filter(([, val]) => Boolean(val))
    ),
  };

  const parsedMapping = columnMappingSchema.safeParse(mergedMapping);
  if (!parsedMapping.success) {
    throw new ImportValidationError(
      'Required column mappings missing (admissionNo, name, className, section)'
    );
  }

  const map = parsedMapping.data;
  const schoolObjectId = new Types.ObjectId(String(params.schoolId));

  // Step 1: Validate all rows in memory first
  const rows: ImportRowReport[] = new Array(rawRows.length);
  const validRows: ValidatedImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i] ?? {};
    const rowNumber = i + 2; // 1-indexed + header row

    const candidate = {
      admissionNo: raw[map.admissionNo] ?? '',
      name: raw[map.name] ?? '',
      className: raw[map.className] ?? '',
      section: raw[map.section] ?? '',
      rollNumber: map.rollNumber ? (raw[map.rollNumber] ?? '') : '',
    };

    const validated = studentImportRowSchema.safeParse(candidate);
    if (!validated.success) {
      const reason = validated.error.issues.map((iss) => iss.message).join('; ');
      rows[i] = {
        rowNumber,
        admissionNo: candidate.admissionNo,
        name: candidate.name,
        status: 'failed',
        reason,
      };
      continue;
    }

    const data = validated.data;
    validRows.push({
      rowNumber,
      reportIndex: i,
      admissionNo: data.admissionNo,
      name: data.name,
      className: data.className,
      section: data.section,
      rollNumber: data.rollNumber ?? '',
    });
  }

  // Step 2: Single query to find existing admissionNos in DB
  if (validRows.length > 0) {
    const uniqueAdmissionNos = Array.from(
      new Set(validRows.map((r) => r.admissionNo))
    );
    const existingDocs = await Student.find(
      {
        schoolId: schoolObjectId,
        admissionNo: { $in: uniqueAdmissionNos },
      },
      { admissionNo: 1 }
    ).lean();

    const knownExistingSet = new Set(existingDocs.map((d) => d.admissionNo));

    // Pre-assign created vs updated status before bulkWrite
    for (const vr of validRows) {
      if (knownExistingSet.has(vr.admissionNo)) {
        rows[vr.reportIndex] = {
          rowNumber: vr.rowNumber,
          admissionNo: vr.admissionNo,
          name: vr.name,
          status: 'updated',
          reason: 'Updated existing student by admissionNo',
        };
      } else {
        knownExistingSet.add(vr.admissionNo);
        rows[vr.reportIndex] = {
          rowNumber: vr.rowNumber,
          admissionNo: vr.admissionNo,
          name: vr.name,
          status: 'created',
          reason: 'Created new student',
        };
      }
    }

    // Step 3: Student.bulkWrite with updateOne+upsert ops in chunks of 500, ordered: false
    for (
      let chunkStart = 0;
      chunkStart < validRows.length;
      chunkStart += BULK_WRITE_CHUNK_SIZE
    ) {
      const chunk = validRows.slice(
        chunkStart,
        chunkStart + BULK_WRITE_CHUNK_SIZE
      );
      const ops = chunk.map((vr) => ({
        updateOne: {
          filter: { schoolId: schoolObjectId, admissionNo: vr.admissionNo },
          update: {
            $set: {
              schoolId: schoolObjectId,
              admissionNo: vr.admissionNo,
              name: vr.name,
              className: vr.className,
              section: vr.section,
              rollNumber: vr.rollNumber,
              isActive: true,
            },
          },
          upsert: true,
        },
      }));

      try {
        await Student.bulkWrite(ops, { ordered: false });
      } catch (err) {
        // Step 4: Map per-chunk write errors back to row numbers in the report
        const writeErrors: BulkWriteErrorItem[] =
          err &&
          typeof err === 'object' &&
          'writeErrors' in err &&
          Array.isArray((err as { writeErrors?: unknown[] }).writeErrors)
            ? ((err as { writeErrors: BulkWriteErrorItem[] }).writeErrors ?? [])
            : [];

        if (writeErrors.length > 0) {
          for (const we of writeErrors) {
            const failedRow = chunk[we.index];
            if (failedRow) {
              rows[failedRow.reportIndex] = {
                rowNumber: failedRow.rowNumber,
                admissionNo: failedRow.admissionNo,
                name: failedRow.name,
                status: 'failed',
                reason:
                  we.errmsg ?? we.message ?? 'Database bulkWrite error on row',
              };
            }
          }
        } else {
          // Entire chunk failed unexpectedly
          const message =
            err instanceof Error ? err.message : 'Database bulkWrite failed';
          for (const failedRow of chunk) {
            rows[failedRow.reportIndex] = {
              rowNumber: failedRow.rowNumber,
              admissionNo: failedRow.admissionNo,
              name: failedRow.name,
              status: 'failed',
              reason: message,
            };
          }
        }
      }
    }
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === 'created') created += 1;
    else if (r.status === 'updated') updated += 1;
    else failed += 1;
  }

  await writeAuditLog({
    schoolId: schoolObjectId,
    userId: params.userId,
    action: 'student.import',
    entityType: 'Student',
    metadata: {
      total: rawRows.length,
      created,
      updated,
      failed,
    },
  });

  return {
    total: rawRows.length,
    created,
    updated,
    failed,
    rows,
    reportCsv: buildImportReportCsv(rows),
  };
}

export function generateStudentTemplateCsv(locale: 'hi' | 'en' = 'en'): string {
  if (locale === 'hi') {
    return [
      'प्रवेश संख्या,नाम,कक्षा,वर्ग,रोल नंबर',
      'ADM-2026-101,आरव कुमार,5,A,101',
      'ADM-2026-102,प्रिया शर्मा,5,A,102',
    ].join('\n');
  }
  return [
    'admissionNo,name,className,section,rollNumber',
    'ADM-2026-101,Aarav Kumar,5,A,101',
    'ADM-2026-102,Priya Sharma,5,A,102',
  ].join('\n');
}
