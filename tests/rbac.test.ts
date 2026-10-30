import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';

const mockAuth = vi.fn();

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

import { connectDB } from '@/lib/db';
import { requireRole, requireSchoolAccess, RbacError } from '@/lib/rbac';
import {
  GET as listStudentsRoute,
  POST as createStudentRoute,
} from '@/app/api/schools/[schoolId]/students/route';
import { POST as importStudentsRoute } from '@/app/api/schools/[schoolId]/students/import/route';
import { GET as downloadTemplateRoute } from '@/app/api/schools/[schoolId]/students/template/route';
import {
  GET as getStudentDetailRoute,
  PATCH as updateStudentRoute,
} from '@/app/api/schools/[schoolId]/students/[studentId]/route';
import {
  GET as listGuardiansRoute,
  POST as addGuardianRoute,
  DELETE as removeGuardianRoute,
} from '@/app/api/schools/[schoolId]/students/[studentId]/guardians/route';
import { GET as getAdminOverview } from '@/app/api/admin/overview/route';
import {
  authenticateWithPhoneAndPassword,
  RateLimitError,
  SESSION_MAX_AGE_SECONDS,
  TOKEN_RECHECK_INTERVAL_MS,
  verifyAndRefreshJwtToken,
} from '@/lib/auth-service';
import { authConfig } from '@/auth.config';
import { getRateLimiter } from '@/lib/rate-limit';
import { assertNotProduction } from '@/scripts/seed';
import {
  School,
  User,
  Student,
  Visitor,
  GuardianLink,
  Visit,
  AuditLog,
  recordVisit,
} from '@/models';

let mongoServer: MongoMemoryServer;

describe('GateSathi Phase 1 & Phase 2 — Real MongoDB Memory Server Suite', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectDB();

    await Promise.all([
      School.syncIndexes(),
      User.syncIndexes(),
      Student.syncIndexes(),
      Visitor.syncIndexes(),
      GuardianLink.syncIndexes(),
      Visit.syncIndexes(),
      AuditLog.syncIndexes(),
    ]);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await getRateLimiter().clearAll();
    await Promise.all([
      School.deleteMany({}),
      User.deleteMany({}),
      Student.deleteMany({}),
      Visitor.deleteMany({}),
      GuardianLink.deleteMany({}),
      Visit.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  async function seedTwoSchools() {
    const schoolA = await School.create({
      schoolId: 'SCH-A',
      name: 'School A',
      udiseCode: '09150100101',
      district: 'Lucknow',
      state: 'Uttar Pradesh',
    });
    const schoolB = await School.create({
      schoolId: 'SCH-B',
      name: 'School B',
      udiseCode: '09150100102',
      district: 'Kanpur',
      state: 'Uttar Pradesh',
    });
    const principalAId = new mongoose.Types.ObjectId();
    const guardAId = new mongoose.Types.ObjectId();
    return { schoolA, schoolB, principalAId, guardAId };
  }

  it('enforces real MongoDB unique index on {schoolId, admissionNo} for Student', async () => {
    const { schoolA, schoolB, principalAId } = await seedTwoSchools();

    mockAuth.mockResolvedValue({
      user: {
        id: String(principalAId),
        name: 'Principal A',
        phone: '9999999991',
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    // First insert succeeds via real route handler
    const req1 = new NextRequest(
      `http://localhost:3000/api/schools/${String(schoolA._id)}/students`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admissionNo: 'ADM-101',
          name: 'Aarav Kumar',
          className: '5',
          section: 'A',
          rollNumber: '1',
        }),
      }
    );
    const res1 = await createStudentRoute(req1, {
      params: Promise.resolve({ schoolId: String(schoolA._id) }),
    });
    expect(res1.status).toBe(201);

    // Second insert with same {schoolId, admissionNo} fails due to real MongoDB unique index
    await expect(
      Student.create({
        schoolId: schoolA._id,
        admissionNo: 'ADM-101',
        name: 'Duplicate Student',
        className: '6',
        section: 'B',
      })
    ).rejects.toMatchObject({ code: 11000 });

    // And route handler returns 409 Conflict
    const req2 = new NextRequest(
      `http://localhost:3000/api/schools/${String(schoolA._id)}/students`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admissionNo: 'ADM-101',
          name: 'Duplicate Student',
          className: '6',
          section: 'B',
        }),
      }
    );
    const res2 = await createStudentRoute(req2, {
      params: Promise.resolve({ schoolId: String(schoolA._id) }),
    });
    expect(res2.status).toBe(409);

    // Same admissionNo in a different school (School B) is allowed
    const studentInB = await Student.create({
      schoolId: schoolB._id,
      admissionNo: 'ADM-101',
      name: 'Other School Student',
      className: '5',
      section: 'A',
    });
    expect(studentInB.admissionNo).toBe('ADM-101');
  });

  it('enforces real MongoDB unique index on {schoolId, clientId} for Visit', async () => {
    const { schoolA, guardAId } = await seedTwoSchools();
    const student = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-001',
      name: 'Aarav Kumar',
      className: '5',
      section: 'A',
    });
    const visitor = await Visitor.create({
      schoolId: schoolA._id,
      name: 'Suresh Kumar',
      phone: '9811111111',
    });

    const first = await recordVisit({
      schoolId: schoolA._id,
      clientId: 'client-uuid-123',
      visitorId: visitor._id,
      studentIds: [student._id],
      purpose: 'student_pickup',
      checkedInBy: guardAId,
    });
    expect(first.clientId).toBe('client-uuid-123');
    expect(first.isInside).toBe(true);

    // Second insert with same {schoolId, clientId} fails via MongoDB unique index
    await expect(
      recordVisit({
        schoolId: schoolA._id,
        clientId: 'client-uuid-123',
        visitorId: visitor._id,
        studentIds: [student._id],
        purpose: 'student_pickup',
        checkedInBy: guardAId,
      })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('enforces cross-school 403 on real route handlers and blocks guards from all Phase 2 & admin routes', async () => {
    const { schoolA, schoolB, principalAId, guardAId } = await seedTwoSchools();

    const studentA = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-A1',
      name: 'Aarav A',
      className: '5',
      section: 'A',
    });
    await Student.create({
      schoolId: schoolB._id,
      admissionNo: 'ADM-B1',
      name: 'Bharat B',
      className: '5',
      section: 'A',
    });

    // 1. Guard of School A gets 403 on School B via requireSchoolAccess AND gets 403 on all Phase 2 & admin routes
    mockAuth.mockResolvedValue({
      user: {
        id: String(guardAId),
        name: 'Guard A',
        phone: '9999999992',
        role: 'guard',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    await expect(requireSchoolAccess(String(schoolB._id))).rejects.toMatchObject({
      status: 403,
    });
    await expect(requireRole('super_admin', 'principal')).rejects.toBeInstanceOf(
      RbacError
    );

    const adminRes = await getAdminOverview(
      new NextRequest(
        `http://localhost:3000/api/admin/overview?schoolId=${String(schoolA._id)}`
      )
    );
    expect(adminRes.status).toBe(403);

    // Guard hitting all Phase 2 routes gets 403
    const schoolAParams = {
      params: Promise.resolve({ schoolId: String(schoolA._id) }),
    };
    const studentAParams = {
      params: Promise.resolve({
        schoolId: String(schoolA._id),
        studentId: String(studentA._id),
      }),
    };

    expect(
      (
        await listStudentsRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students`
          ),
          schoolAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await createStudentRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students`,
            {
              method: 'POST',
              body: JSON.stringify({
                admissionNo: 'ADM-X',
                name: 'X',
                className: '5',
                section: 'A',
              }),
            }
          ),
          schoolAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await importStudentsRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/import`,
            { method: 'POST' }
          ),
          schoolAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await downloadTemplateRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/template`
          ),
          schoolAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await getStudentDetailRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(studentA._id)}`
          ),
          studentAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await updateStudentRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(studentA._id)}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ name: 'New Name' }),
            }
          ),
          studentAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await listGuardiansRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(studentA._id)}/guardians`
          ),
          studentAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await addGuardianRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(studentA._id)}/guardians`,
            {
              method: 'POST',
              body: JSON.stringify({
                name: 'Guardian',
                phone: '9812345678',
                relation: 'Father',
              }),
            }
          ),
          studentAParams
        )
      ).status
    ).toBe(403);

    expect(
      (
        await removeGuardianRoute(
          new NextRequest(
            `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(studentA._id)}/guardians?guardianLinkId=${String(new mongoose.Types.ObjectId())}`,
            { method: 'DELETE' }
          ),
          studentAParams
        )
      ).status
    ).toBe(403);

    // 2. Principal of School A gets 200 on School A students, and 403 on School B students
    mockAuth.mockResolvedValue({
      user: {
        id: String(principalAId),
        name: 'Principal A',
        phone: '9999999991',
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    const okRes = await listStudentsRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students`
      ),
      schoolAParams
    );
    expect(okRes.status).toBe(200);
    const okData = await okRes.json();
    expect(okData.students).toHaveLength(1);
    expect(okData.students[0].admissionNo).toBe('ADM-A1');

    const crossSchoolRes = await listStudentsRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolB._id)}/students`
      ),
      { params: Promise.resolve({ schoolId: String(schoolB._id) }) }
    );
    expect(crossSchoolRes.status).toBe(403);
  });

  it('prevents School A principal from adding a guardian to a School B student, and supports sibling guardians + soft removal', async () => {
    const { schoolA, schoolB, principalAId } = await seedTwoSchools();

    const sibling1 = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-S1',
      name: 'Sibling One',
      className: '5',
      section: 'A',
    });
    const sibling2 = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-S2',
      name: 'Sibling Two',
      className: '7',
      section: 'B',
    });
    const studentB = await Student.create({
      schoolId: schoolB._id,
      admissionNo: 'ADM-B1',
      name: 'School B Student',
      className: '6',
      section: 'A',
    });

    mockAuth.mockResolvedValue({
      user: {
        id: String(principalAId),
        name: 'Principal A',
        phone: '9999999991',
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    // Attempting to add a guardian to studentB via School B URL -> 403
    const crossRouteRes1 = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolB._id)}/students/${String(studentB._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rakesh Kumar',
            phone: '9876543210',
            relation: 'Father',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolB._id),
          studentId: String(studentB._id),
        }),
      }
    );
    expect(crossRouteRes1.status).toBe(403);

    // Attempting to smuggle studentB's ID under School A's URL -> 403
    const crossRouteRes2 = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(studentB._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rakesh Kumar',
            phone: '9876543210',
            relation: 'Father',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(studentB._id),
        }),
      }
    );
    expect(crossRouteRes2.status).toBe(403);

    // Add same visitor (phone 9876543210) as Father of both sibling1 and sibling2 in School A
    const addSibling1Res = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling1._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rakesh Kumar',
            phone: '9876543210',
            relation: 'Father',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling1._id),
        }),
      }
    );
    expect(addSibling1Res.status).toBe(201);
    const { guardian: g1 } = await addSibling1Res.json();

    const addSibling2Res = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling2._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rakesh Kumar',
            phone: '9876543210',
            relation: 'Father',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling2._id),
        }),
      }
    );
    expect(addSibling2Res.status).toBe(201);
    const { guardian: g2 } = await addSibling2Res.json();

    // Both sibling GuardianLinks share the exact same Visitor document
    expect(g1.visitorId).toBe(g2.visitorId);
    expect(await Visitor.countDocuments({ schoolId: schoolA._id })).toBe(1);

    // Soft-remove guardian from sibling1 -> sets approved=false, keeps record in DB
    const delRes = await removeGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling1._id)}/guardians?guardianLinkId=${g1.guardianLinkId}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling1._id),
        }),
      }
    );
    expect(delRes.status).toBe(200);

    const rawLinkInDb = await GuardianLink.findById(g1.guardianLinkId).lean();
    expect(rawLinkInDb).not.toBeNull();
    expect(rawLinkInDb?.approved).toBe(false);

    // AuditLog recorded both guardian.add and guardian.remove
    const auditActions = await AuditLog.find({ schoolId: schoolA._id })
      .select('action')
      .lean();
    expect(auditActions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['guardian.add', 'guardian.remove'])
    );
  });

  it('imports CSV/XLSX with mixed valid/invalid rows and updates on re-import instead of duplicating', async () => {
    const { schoolA, principalAId } = await seedTwoSchools();

    mockAuth.mockResolvedValue({
      user: {
        id: String(principalAId),
        name: 'Principal A',
        phone: '9999999991',
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    // 1. First import with mixed valid and invalid rows
    const csvContent = [
      'admissionNo,name,className,section,rollNumber',
      'ADM-201,Aarav Kumar,5,A,101',
      'ADM-202,Priya Sharma,5,B,102',
      ',Missing AdmissionNo,5,A,103',
      'ADM-204,,6,A,104',
    ].join('\n');

    const fd1 = new FormData();
    fd1.append(
      'file',
      new File([csvContent], 'students.csv', { type: 'text/csv' })
    );
    fd1.append('mode', 'commit');

    const res1 = await importStudentsRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/import`,
        {
          method: 'POST',
          body: fd1,
        }
      ),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );

    expect(res1.status).toBe(200);
    const report1 = await res1.json();
    expect(report1.total).toBe(4);
    expect(report1.created).toBe(2);
    expect(report1.updated).toBe(0);
    expect(report1.failed).toBe(2);
    expect(report1.rows[2].status).toBe('failed');
    expect(report1.rows[2].reason).toContain('Missing admissionNo');
    expect(report1.rows[3].status).toBe('failed');
    expect(report1.rows[3].reason).toContain('Missing student name');
    expect(report1.reportCsv).toContain('ADM-201,Aarav Kumar,created');

    expect(await Student.countDocuments({ schoolId: schoolA._id })).toBe(2);

    // 2. Re-import using XLSX with Hindi headers: updates ADM-201 & ADM-202 and adds ADM-205
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['प्रवेश संख्या', 'नाम', 'कक्षा', 'वर्ग', 'रोल नंबर'],
      ['ADM-201', 'Aarav Kumar Updated', '6', 'A', '201'],
      ['ADM-202', 'Priya Sharma Updated', '6', 'B', '202'],
      ['ADM-205', 'Rohan Verma', '7', 'A', '301'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fd2 = new FormData();
    fd2.append(
      'file',
      new File([xlsxBuffer], 'students-hi.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );
    fd2.append('mode', 'commit');

    const res2 = await importStudentsRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/import`,
        {
          method: 'POST',
          body: fd2,
        }
      ),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );

    expect(res2.status).toBe(200);
    const report2 = await res2.json();
    expect(report2.total).toBe(3);
    expect(report2.created).toBe(1);
    expect(report2.updated).toBe(2);
    expect(report2.failed).toBe(0);

    // Total students is 3 (updated in-place, not duplicated)
    expect(await Student.countDocuments({ schoolId: schoolA._id })).toBe(3);
    const updatedAarav = await Student.findOne({
      schoolId: schoolA._id,
      admissionNo: 'ADM-201',
    }).lean();
    expect(updatedAarav?.name).toBe('Aarav Kumar Updated');
    expect(updatedAarav?.className).toBe('6');

    const importAudits = await AuditLog.countDocuments({
      schoolId: schoolA._id,
      action: 'student.import',
    });
    expect(importAudits).toBe(2);
  });

  it('revokes session access within 5 minutes when user is deactivated or tokenVersion changes in MongoDB', async () => {
    expect(authConfig.session.maxAge).toBe(8 * 60 * 60);
    expect(SESSION_MAX_AGE_SECONDS).toBe(28800);

    const { schoolA } = await seedTwoSchools();
    const userDoc = await User.create({
      name: 'Ramesh Tiwari',
      phone: '9999999992',
      passwordHash: await bcrypt.hash('Password@123', 4),
      role: 'guard',
      schoolIds: [schoolA._id],
      tokenVersion: 0,
      isActive: true,
    });

    const t0 = 1_700_000_000_000;
    const initialToken = await verifyAndRefreshJwtToken(
      {},
      {
        id: String(userDoc._id),
        name: userDoc.name,
        phone: userDoc.phone,
        role: userDoc.role,
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
      { nowMs: t0 }
    );
    expect(initialToken.invalidated).toBe(false);

    // Deactivate user in real MongoDB
    await User.findByIdAndUpdate(userDoc._id, { $set: { isActive: false } });

    // Within 5 minutes (at +2m), token is still cached
    const tokenAt2Min = await verifyAndRefreshJwtToken(initialToken, undefined, {
      nowMs: t0 + 2 * 60 * 1000,
    });
    expect(tokenAt2Min.invalidated).toBe(false);

    // At +5 minutes, DB re-check runs against MongoDB and invalidates the session
    const tokenAt5Min = await verifyAndRefreshJwtToken(tokenAt2Min, undefined, {
      nowMs: t0 + TOKEN_RECHECK_INTERVAL_MS,
    });
    expect(tokenAt5Min.invalidated).toBe(true);
    expect(tokenAt5Min.id).toBeUndefined();
  });

  it('rate limits a 6th attempt from the same phone+IP, but allows login from another IP against real MongoDB', async () => {
    const { schoolA } = await seedTwoSchools();
    await User.create({
      name: 'Ramesh Tiwari',
      phone: '9999999992',
      passwordHash: await bcrypt.hash('Correct@123', 4),
      role: 'guard',
      schoolIds: [schoolA._id],
      tokenVersion: 0,
      isActive: true,
    });

    const attackerIp = '203.0.113.10';
    const legitimateDeviceIp = '198.51.100.42';

    for (let i = 1; i <= 5; i++) {
      const res = await authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'WrongPassword' },
        { ip: attackerIp }
      );
      expect(res).toBeNull();
    }

    await expect(
      authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'Correct@123' },
        { ip: attackerIp }
      )
    ).rejects.toBeInstanceOf(RateLimitError);

    const validUser = await authenticateWithPhoneAndPassword(
      { phone: '9999999992', password: 'Correct@123' },
      { ip: legitimateDeviceIp }
    );
    expect(validUser).not.toBeNull();
    expect(validUser?.phone).toBe('9999999992');
  });

  it('returns 409 when adding a guardian with an existing phone and different name, and resolves via use_existing or update_name with audit log', async () => {
    const { schoolA, principalAId } = await seedTwoSchools();

    const sibling1 = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-S1',
      name: 'Aarav Kumar',
      className: '5',
      section: 'A',
    });
    const sibling2 = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-S2',
      name: 'Ananya Kumar',
      className: '7',
      section: 'B',
    });

    mockAuth.mockResolvedValue({
      user: {
        id: String(principalAId),
        name: 'Principal A',
        phone: '9999999991',
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    // Step 1: Add Rakesh Kumar (9876543210) as Father of sibling1
    const res1 = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling1._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rakesh Kumar',
            phone: '9876543210',
            relation: 'Father',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling1._id),
        }),
      }
    );
    expect(res1.status).toBe(201);

    // Step 2: Add same phone (9876543210) with a different name ("Mukesh Kumar") for sibling2 -> 409 Conflict
    const resConflict = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling2._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Mukesh Kumar',
            phone: '9876543210',
            relation: 'Uncle',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling2._id),
        }),
      }
    );
    expect(resConflict.status).toBe(409);
    const conflictBody = await resConflict.json();
    expect(conflictBody.existingVisitor.name).toBe('Rakesh Kumar');
    expect(conflictBody.existingVisitor.relations).toEqual(['Father']);
    expect(conflictBody.existingVisitor.linkedStudents).toHaveLength(1);
    expect(conflictBody.existingVisitor.linkedStudents[0].admissionNo).toBe(
      'ADM-S1'
    );

    // Visitor name in DB must NOT be overwritten
    const visitorStillRakesh = await Visitor.findOne({
      schoolId: schoolA._id,
      phone: '9876543210',
    }).lean();
    expect(visitorStillRakesh?.name).toBe('Rakesh Kumar');

    // Step 3: Explicit choice "use_existing" links sibling2 without changing visitor name
    const resUseExisting = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling2._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Mukesh Kumar',
            phone: '9876543210',
            relation: 'Father',
            conflictResolution: 'use_existing',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling2._id),
        }),
      }
    );
    expect(resUseExisting.status).toBe(201);
    const useExistingBody = await resUseExisting.json();
    expect(useExistingBody.guardian.name).toBe('Rakesh Kumar');

    // Step 4: Explicit choice "update_name" updates visitor name and writes visitor.rename AuditLog
    const resUpdateName = await addGuardianRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/${String(sibling2._id)}/guardians`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Rakesh Kumar Verma',
            phone: '9876543210',
            relation: 'Father',
            conflictResolution: 'update_name',
          }),
        }
      ),
      {
        params: Promise.resolve({
          schoolId: String(schoolA._id),
          studentId: String(sibling2._id),
        }),
      }
    );
    expect(resUpdateName.status).toBe(201);
    const updateNameBody = await resUpdateName.json();
    expect(updateNameBody.guardian.name).toBe('Rakesh Kumar Verma');

    const renameAudit = await AuditLog.findOne({
      schoolId: schoolA._id,
      action: 'visitor.rename',
    }).lean();
    expect(renameAudit).not.toBeNull();
    expect(renameAudit?.metadata).toMatchObject({
      previousName: 'Rakesh Kumar',
      newName: 'Rakesh Kumar Verma',
      phone: '9876543210',
    });
  });

  it('imports 5,000 rows in chunks of 500 via bulkWrite in under 10 seconds', async () => {
    const { schoolA, principalAId } = await seedTwoSchools();

    mockAuth.mockResolvedValue({
      user: {
        id: String(principalAId),
        name: 'Principal A',
        phone: '9999999991',
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });

    // Pre-insert 100 existing students to verify mixed created (4,900) + updated (100)
    const preExistingOps = Array.from({ length: 100 }, (_, i) => ({
      insertOne: {
        document: {
          schoolId: schoolA._id,
          admissionNo: `ADM-5K-${String(i + 1).padStart(4, '0')}`,
          name: `Old Student ${i + 1}`,
          className: '4',
          section: 'A',
          rollNumber: String(i + 1),
          isActive: true,
        },
      },
    }));
    await Student.bulkWrite(preExistingOps);

    const lines = ['admissionNo,name,className,section,rollNumber'];
    for (let i = 1; i <= 5000; i++) {
      const admNo = `ADM-5K-${String(i).padStart(4, '0')}`;
      const cls = String((i % 10) + 1);
      const sec = i % 2 === 0 ? 'A' : 'B';
      lines.push(`${admNo},Student ${i},${cls},${sec},${i}`);
    }
    const csv5000 = lines.join('\n');

    const fd = new FormData();
    fd.append(
      'file',
      new File([csv5000], 'students-5000.csv', { type: 'text/csv' })
    );
    fd.append('mode', 'commit');

    const startMs = performance.now();
    const res = await importStudentsRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/import`,
        {
          method: 'POST',
          body: fd,
        }
      ),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );
    const elapsedMs = performance.now() - startMs;

    console.log(
      `[5,000-row import benchmark] Completed in ${elapsedMs.toFixed(1)} ms`
    );

    expect(res.status).toBe(200);
    expect(elapsedMs).toBeLessThan(10_000);

    const report = await res.json();
    expect(report.total).toBe(5000);
    expect(report.created).toBe(4900);
    expect(report.updated).toBe(100);
    expect(report.failed).toBe(0);
    expect(await Student.countDocuments({ schoolId: schoolA._id })).toBe(5000);
  });

  it('refuses to run the seed script when NODE_ENV=production', () => {
    expect(() => assertNotProduction('production')).toThrow(
      /NODE_ENV=production/
    );
    expect(() => assertNotProduction('development')).not.toThrow();
  });
});
