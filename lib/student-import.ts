import * as XLSX from 'xlsx';
import { Types } from 'mongoose';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import {
  GuardianLink,
  GUARDIAN_RELATIONS,
  type GuardianRelation,
} from '@/models/GuardianLink';
import { writeAuditLog } from '@/lib/audit';
import {
  columnMappingSchema,
  indianPhoneSchema,
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
  fatherName: [
    'fathername',
    'father_name',
    'father name',
    'पिता का नाम',
    'पिता नाम',
  ],
  fatherPhone: [
    'fatherphone',
    'father_phone',
    'father phone',
    'father mobile',
    'पिता का मोबाइल',
    'पिता का फोन',
    'पिता मोबाइल नंबर',
  ],
  motherName: [
    'mothername',
    'mother_name',
    'mother name',
    'माता का नाम',
    'माता नाम',
  ],
  motherPhone: [
    'motherphone',
    'mother_phone',
    'mother phone',
    'mother mobile',
    'माता का मोबाइल',
    'माता का फोन',
    'माता मोबाइल नंबर',
  ],
  guardianName: [
    'guardianname',
    'guardian_name',
    'guardian name',
    'अभिभावक का नाम',
    'संरक्षक का नाम',
  ],
  guardianPhone: [
    'guardianphone',
    'guardian_phone',
    'guardian phone',
    'guardian mobile',
    'अभिभावक का मोबाइल',
    'अभिभावक का फोन',
    'अभिभावक मोबाइल नंबर',
  ],
  guardianRelation: [
    'guardianrelation',
    'guardian_relation',
    'guardian relation',
    'relation',
    'अभिभावक का संबंध',
    'अभिभावक संबंध',
    'संबंध',
  ],
};

const RELATION_ALIASES: Record<string, GuardianRelation> = {
  father: 'Father',
  पिता: 'Father',
  mother: 'Mother',
  माता: 'Mother',
  grandparent: 'Grandparent',
  दादा: 'Grandparent',
  दादी: 'Grandparent',
  नाना: 'Grandparent',
  नानी: 'Grandparent',
  sibling: 'Sibling',
  भाई: 'Sibling',
  बहन: 'Sibling',
  uncle: 'Uncle',
  चाचा: 'Uncle',
  मामा: 'Uncle',
  ताऊ: 'Uncle',
  aunt: 'Aunt',
  चाची: 'Aunt',
  मामी: 'Aunt',
  बुआ: 'Aunt',
  मौसी: 'Aunt',
  other: 'Other',
  अन्य: 'Other',
};

export function normalizeGuardianRelation(raw?: string): GuardianRelation {
  if (!raw) return 'Other';
  const trimmed = raw.trim();
  if ((GUARDIAN_RELATIONS as readonly string[]).includes(trimmed)) {
    return trimmed as GuardianRelation;
  }
  const alias = RELATION_ALIASES[trimmed.toLowerCase()];
  return alias ?? 'Other';
}

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
  guardiansCreated: number;
  guardiansLinked: number;
  guardianConflicts: number;
  reason: string;
}

export interface ImportExecutionSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  guardiansCreated: number;
  guardiansLinked: number;
  guardianConflicts: number;
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
  const header = [
    'rowNumber',
    'admissionNo',
    'name',
    'status',
    'guardiansCreated',
    'guardiansLinked',
    'guardianConflicts',
    'reason',
  ].join(',');
  const lines = rows.map((r) =>
    [
      String(r.rowNumber),
      escapeCsvCell(r.admissionNo),
      escapeCsvCell(r.name),
      r.status,
      String(r.guardiansCreated),
      String(r.guardiansLinked),
      String(r.guardianConflicts),
      escapeCsvCell(r.reason),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

interface GuardianCandidate {
  name: string;
  phone: string;
  relation: GuardianRelation;
}

interface ValidatedImportRow {
  rowNumber: number;
  reportIndex: number;
  admissionNo: string;
  name: string;
  className: string;
  section: string;
  rollNumber: string;
  guardians: GuardianCandidate[];
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
  const approvedByObjectId = Types.ObjectId.isValid(String(params.userId))
    ? new Types.ObjectId(String(params.userId))
    : new Types.ObjectId();

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
        guardiansCreated: 0,
        guardiansLinked: 0,
        guardianConflicts: 0,
        reason,
      };
      continue;
    }

    const guardians: GuardianCandidate[] = [];

    const extractGuardian = (
      phoneCol: string | undefined,
      nameCol: string | undefined,
      rel: GuardianRelation
    ) => {
      if (!phoneCol) return;
      const rawPhone = (raw[phoneCol] ?? '').trim();
      if (!rawPhone) return;
      const parsedPhone = indianPhoneSchema.safeParse(rawPhone);
      if (!parsedPhone.success) return;
      const gName = (nameCol ? (raw[nameCol] ?? '') : '').trim() || rel;
      guardians.push({
        phone: parsedPhone.data,
        name: gName,
        relation: rel,
      });
    };

    extractGuardian(map.fatherPhone, map.fatherName, 'Father');
    extractGuardian(map.motherPhone, map.motherName, 'Mother');
    extractGuardian(
      map.guardianPhone,
      map.guardianName,
      normalizeGuardianRelation(
        map.guardianRelation ? raw[map.guardianRelation] : undefined
      )
    );

    const data = validated.data;
    validRows.push({
      rowNumber,
      reportIndex: i,
      admissionNo: data.admissionNo,
      name: data.name,
      className: data.className,
      section: data.section,
      rollNumber: data.rollNumber ?? '',
      guardians,
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

    for (const vr of validRows) {
      if (knownExistingSet.has(vr.admissionNo)) {
        rows[vr.reportIndex] = {
          rowNumber: vr.rowNumber,
          admissionNo: vr.admissionNo,
          name: vr.name,
          status: 'updated',
          guardiansCreated: 0,
          guardiansLinked: 0,
          guardianConflicts: 0,
          reason: 'Updated existing student by admissionNo',
        };
      } else {
        knownExistingSet.add(vr.admissionNo);
        rows[vr.reportIndex] = {
          rowNumber: vr.rowNumber,
          admissionNo: vr.admissionNo,
          name: vr.name,
          status: 'created',
          guardiansCreated: 0,
          guardiansLinked: 0,
          guardianConflicts: 0,
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
                guardiansCreated: 0,
                guardiansLinked: 0,
                guardianConflicts: 0,
                reason:
                  we.errmsg ?? we.message ?? 'Database bulkWrite error on row',
              };
            }
          }
        } else {
          const message =
            err instanceof Error ? err.message : 'Database bulkWrite failed';
          for (const failedRow of chunk) {
            rows[failedRow.reportIndex] = {
              rowNumber: failedRow.rowNumber,
              admissionNo: failedRow.admissionNo,
              name: failedRow.name,
              status: 'failed',
              guardiansCreated: 0,
              guardiansLinked: 0,
              guardianConflicts: 0,
              reason: message,
            };
          }
        }
      }
    }

    // Step 5: Process optional guardian columns for rows that have guardians and succeeded
    const rowsWithGuardians = validRows.filter(
      (vr) =>
        vr.guardians.length > 0 &&
        rows[vr.reportIndex]?.status !== 'failed'
    );

    if (rowsWithGuardians.length > 0) {
      const admNosForGuardians = Array.from(
        new Set(rowsWithGuardians.map((r) => r.admissionNo))
      );
      const studentDocs = await Student.find(
        {
          schoolId: schoolObjectId,
          admissionNo: { $in: admNosForGuardians },
        },
        { _id: 1, admissionNo: 1 }
      ).lean();

      const studentIdByAdmNo = new Map<string, Types.ObjectId>();
      for (const sd of studentDocs) {
        studentIdByAdmNo.set(sd.admissionNo, sd._id as Types.ObjectId);
      }

      const now = new Date();
      for (const vr of rowsWithGuardians) {
        const studentObjectId = studentIdByAdmNo.get(vr.admissionNo);
        const rowReport = rows[vr.reportIndex];
        if (!studentObjectId || !rowReport) continue;

        for (const g of vr.guardians) {
          let visitor = await Visitor.findOne({
            schoolId: schoolObjectId,
            phone: g.phone,
          });

          if (!visitor) {
            visitor = await Visitor.create({
              schoolId: schoolObjectId,
              phone: g.phone,
              name: g.name,
              defaultRelation: g.relation,
              isBlocked: false,
            });
            rowReport.guardiansCreated += 1;
          } else if (
            visitor.name.trim().toLowerCase() !== g.name.trim().toLowerCase()
          ) {
            // Never overwrite an existing visitor name silently; count conflict instead
            rowReport.guardianConflicts += 1;
            rowReport.reason += `; Guardian phone ${g.phone} name conflict (kept "${visitor.name}", ignored "${g.name}")`;
          }

          await GuardianLink.findOneAndUpdate(
            {
              schoolId: schoolObjectId,
              studentId: studentObjectId,
              visitorId: visitor._id,
            },
            {
              $set: {
                schoolId: schoolObjectId,
                studentId: studentObjectId,
                visitorId: visitor._id,
                relation: g.relation,
                approved: true,
                approvedBy: approvedByObjectId,
                approvedAt: now,
              },
            },
            { upsert: true, new: true, runValidators: true }
          );
          rowReport.guardiansLinked += 1;
        }
      }
    }
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  let guardiansCreated = 0;
  let guardiansLinked = 0;
  let guardianConflicts = 0;

  for (const r of rows) {
    if (r.status === 'created') created += 1;
    else if (r.status === 'updated') updated += 1;
    else failed += 1;
    guardiansCreated += r.guardiansCreated;
    guardiansLinked += r.guardiansLinked;
    guardianConflicts += r.guardianConflicts;
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
      guardiansCreated,
      guardiansLinked,
      guardianConflicts,
    },
  });

  return {
    total: rawRows.length,
    created,
    updated,
    failed,
    guardiansCreated,
    guardiansLinked,
    guardianConflicts,
    rows,
    reportCsv: buildImportReportCsv(rows),
  };
}

export function generateStudentTemplateCsv(locale: 'hi' | 'en' = 'en'): string {
  if (locale === 'hi') {
    return [
      'प्रवेश संख्या,नाम,कक्षा,वर्ग,रोल नंबर,पिता का नाम,पिता का मोबाइल,माता का नाम,माता का मोबाइल,अभिभावक का नाम,अभिभावक का मोबाइल,अभिभावक का संबंध',
      'ADM-2026-101,आरव कुमार,5,A,101,राकेश कुमार,9810000001,सुनीता देवी,9810000002,,,',
      'ADM-2026-102,प्रिया शर्मा,5,A,102,दिनेश शर्मा,9810000003,मीना शर्मा,9810000004,सुरेश शर्मा,9810000005,Uncle',
    ].join('\n');
  }
  return [
    'admissionNo,name,className,section,rollNumber,fatherName,fatherPhone,motherName,motherPhone,guardianName,guardianPhone,guardianRelation',
    'ADM-2026-101,Aarav Kumar,5,A,101,Rakesh Kumar,9810000001,Sunita Devi,9810000002,,,',
    'ADM-2026-102,Priya Sharma,5,A,102,Dinesh Sharma,9810000003,Meena Sharma,9810000004,Suresh Sharma,9810000005,Uncle',
  ].join('\n');
}
