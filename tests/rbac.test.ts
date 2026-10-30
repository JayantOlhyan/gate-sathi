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
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
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
  POST as signUploadRoute,
  GET as signGetUploadRoute,
} from '@/app/api/uploads/sign/route';
import { POST as sendOtpRoute } from '@/app/api/gate/otp/send/route';
import { POST as verifyOtpRoute } from '@/app/api/gate/otp/verify/route';
import { GET as gateLookupRoute } from '@/app/api/gate/lookup/route';
import { POST as createGateVisitRoute } from '@/app/api/gate/visits/route';
import { GET as listInsideVisitsRoute } from '@/app/api/gate/visits/inside/route';
import { POST as markVisitExitRoute } from '@/app/api/gate/visits/[visitId]/exit/route';
import { POST as cronCloseVisitsRoute } from '@/app/api/cron/close-visits/route';
import { GET as healthRoute } from '@/app/api/health/route';
import { POST as createLeadRoute } from '@/app/api/leads/route';
import { GET as listAdminLeadsRoute } from '@/app/api/admin/leads/route';
import MarketingLandingPage from '@/app/(marketing)/page';
import AppRedirectPage from '@/app/app/page';
import manifest from '@/app/manifest';
import closeVisitsScheduledHandler, {
  config as closeVisitsScheduleConfig,
} from '@/netlify/functions/close-visits';
import { setHeadObjectInspector } from '@/lib/r2';
import {
  authenticateWithPhoneAndPassword,
  RateLimitError,
  SESSION_MAX_AGE_SECONDS,
  TOKEN_RECHECK_INTERVAL_MS,
  verifyAndRefreshJwtToken,
} from '@/lib/auth-service';
import { authConfig } from '@/auth.config';
import { getRateLimiter, MongoRateLimiter } from '@/lib/rate-limit';
import {
  assertOtpModeSafe,
  isMockOtpActive,
  OTP_EXPIRY_MS,
  sendOtpForVisitor,
  verifyOtpForVisitor,
} from '@/lib/otp';
import { assertNotProduction } from '@/scripts/seed';
import {
  School,
  User,
  Student,
  Visitor,
  GuardianLink,
  Visit,
  AuditLog,
  RateLimit,
  OtpRequest,
  Lead,
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
      RateLimit.syncIndexes(),
      OtpRequest.syncIndexes(),
      Lead.syncIndexes(),
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
    setHeadObjectInspector(null);
    await getRateLimiter().clearAll();
    await Promise.all([
      School.deleteMany({}),
      User.deleteMany({}),
      Student.deleteMany({}),
      Visitor.deleteMany({}),
      GuardianLink.deleteMany({}),
      Visit.deleteMany({}),
      AuditLog.deleteMany({}),
      RateLimit.deleteMany({}),
      OtpRequest.deleteMany({}),
      Lead.deleteMany({}),
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

  it('enforces OTP rules: 4th send in an hour rejected, 6th verify attempt rejected, expired code rejected, and mock mode throws in production', async () => {
    const { schoolA, guardAId } = await seedTwoSchools();

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

    // 1. OTP_MODE=mock throws without ALLOW_MOCK_OTP=true (especially in production), and is allowed only when OTP_MODE=mock AND ALLOW_MOCK_OTP=true
    expect(() => assertOtpModeSafe('production', 'mock', undefined)).toThrow(
      /OTP_MODE=mock is forbidden/
    );
    expect(() => assertOtpModeSafe('production', 'mock', 'false')).toThrow(
      /OTP_MODE=mock is forbidden/
    );
    expect(() => assertOtpModeSafe('development', 'mock', undefined)).toThrow(
      /requires ALLOW_MOCK_OTP=true/
    );
    expect(() =>
      assertOtpModeSafe('production', 'mock', 'true')
    ).not.toThrow();
    expect(() =>
      assertOtpModeSafe('development', 'mock', 'true')
    ).not.toThrow();
    expect(isMockOtpActive('mock', undefined)).toBe(false);
    expect(isMockOtpActive('mock', 'true')).toBe(true);

    const phone = '9812345670';
    const t0 = Date.now();
    process.env.OTP_MODE = 'mock';
    process.env.ALLOW_MOCK_OTP = 'true';
    let capturedCode = '';
    const captureProvider = {
      async sendOtp(_p: string, code: string) {
        capturedCode = code;
      },
    };

    // 2. Send 3 OTPs within an hour -> all succeed; 4th send in same hour -> rejected (429)
    await sendOtpForVisitor({
      schoolId: schoolA._id,
      phone,
      nowMs: t0,
      provider: captureProvider,
      nodeEnv: 'development',
      otpMode: 'mock',
      allowMockOtp: 'true',
    });
    await sendOtpForVisitor({
      schoolId: schoolA._id,
      phone,
      nowMs: t0 + 10_000,
      provider: captureProvider,
      nodeEnv: 'development',
      otpMode: 'mock',
      allowMockOtp: 'true',
    });
    await sendOtpForVisitor({
      schoolId: schoolA._id,
      phone,
      nowMs: t0 + 20_000,
      provider: captureProvider,
      nodeEnv: 'development',
      otpMode: 'mock',
      allowMockOtp: 'true',
    });

    await expect(
      sendOtpForVisitor({
        schoolId: schoolA._id,
        phone,
        nowMs: t0 + 30_000,
        provider: captureProvider,
        nodeEnv: 'development',
        otpMode: 'mock',
        allowMockOtp: 'true',
      })
    ).rejects.toMatchObject({ status: 429 });

    // Also verify via route handler that 4th send returns 429
    const fourthSendRes = await sendOtpRoute(
      new NextRequest('http://localhost:3000/api/gate/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          phone,
        }),
      })
    );
    expect(fourthSendRes.status).toBe(429);

    // 3. Max 5 verify attempts, then 6th attempt rejected even with valid code
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(
        verifyOtpForVisitor({
          schoolId: schoolA._id,
          phone,
          code: '111111',
          nowMs: t0 + 25_000,
          nodeEnv: 'development',
          otpMode: 'msg91',
        })
      ).rejects.toMatchObject({ status: 400 });
    }

    // 6th attempt is rejected with 429 even when providing the real capturedCode
    await expect(
      verifyOtpForVisitor({
        schoolId: schoolA._id,
        phone,
        code: capturedCode,
        nowMs: t0 + 26_000,
        nodeEnv: 'development',
        otpMode: 'msg91',
      })
    ).rejects.toMatchObject({ status: 429 });

    // 4. Expired code (> 5 minutes) is rejected
    const phoneExpired = '9812345671';
    await sendOtpForVisitor({
      schoolId: schoolA._id,
      phone: phoneExpired,
      nowMs: t0,
      provider: captureProvider,
      nodeEnv: 'development',
      otpMode: 'msg91',
    });

    await expect(
      verifyOtpForVisitor({
        schoolId: schoolA._id,
        phone: phoneExpired,
        code: capturedCode,
        nowMs: t0 + OTP_EXPIRY_MS + 1000,
        nodeEnv: 'development',
        otpMode: 'msg91',
      })
    ).rejects.toMatchObject({
      status: 400,
      message: 'OTP has expired',
    });

    // Verify route handler works for valid OTP in mock mode when ALLOW_MOCK_OTP=true
    const phoneValid = '9812345672';
    process.env.OTP_MODE = 'mock';
    process.env.ALLOW_MOCK_OTP = 'true';
    await sendOtpRoute(
      new NextRequest('http://localhost:3000/api/gate/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          phone: phoneValid,
        }),
      })
    );
    const verifyOkRes = await verifyOtpRoute(
      new NextRequest('http://localhost:3000/api/gate/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          phone: phoneValid,
          code: '000000',
        }),
      })
    );
    expect(verifyOkRes.status).toBe(200);

    // Also verify GET /api/health returns { db: 'ok', r2: 'error', otpMode: 'mock' } without secrets
    const healthRes = await healthRoute(
      new NextRequest('http://localhost:3000/api/health')
    );
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson).toEqual({
      db: 'ok',
      r2: 'error',
      otpMode: 'mock',
    });
  });

  it('computes isApproved server-side from GuardianLink, ignores client-sent isApproved, requires unapprovedReason, and handles idempotent clientId', async () => {
    const { schoolA, schoolB, principalAId, guardAId } = await seedTwoSchools();

    const studentLinked = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-L1',
      name: 'Linked Student',
      className: '5',
      section: 'A',
    });
    const studentUnlinked = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-U1',
      name: 'Unlinked Student',
      className: '6',
      section: 'B',
    });
    const studentInSchoolB = await Student.create({
      schoolId: schoolB._id,
      admissionNo: 'ADM-B1',
      name: 'School B Student',
      className: '5',
      section: 'A',
    });

    const visitor = await Visitor.create({
      schoolId: schoolA._id,
      name: 'Rakesh Kumar',
      phone: '9876543210',
      photoKey: `${String(schoolA._id)}/visitors/photo-1.jpg`,
    });

    await GuardianLink.create({
      schoolId: schoolA._id,
      studentId: studentLinked._id,
      visitorId: visitor._id,
      relation: 'Father',
      approved: true,
      approvedBy: principalAId,
      approvedAt: new Date(),
    });

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

    // Lookup known visitor returns linked student and signedPhotoUrl
    const lookupRes = await gateLookupRoute(
      new NextRequest(
        `http://localhost:3000/api/gate/lookup?schoolId=${String(schoolA._id)}&phone=9876543210`
      )
    );
    expect(lookupRes.status).toBe(200);
    const lookupData = await lookupRes.json();
    expect(lookupData.found).toBe(true);
    expect(lookupData.linkedStudents).toHaveLength(1);
    expect(lookupData.visitor.signedPhotoUrl).toContain('r2.cloudflarestorage.com');

    // 1. Linked visitor visiting linked student -> server sets isApproved = true
    // Also test idempotency: sending the exact same clientId twice creates only 1 Visit and returns same visit
    const clientId1 = 'visit-uuid-linked-1';
    const linkedVisitPayload = {
      schoolId: String(schoolA._id),
      clientId: clientId1,
      phone: '9876543210',
      name: 'Rakesh Kumar',
      studentIds: [String(studentLinked._id)],
      purpose: 'Pickup',
      isApproved: false, // Client tries to spoof false; server must compute true!
    };

    const createRes1 = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkedVisitPayload),
      })
    );
    expect(createRes1.status).toBe(201);
    const data1 = await createRes1.json();
    expect(data1.visit.isApproved).toBe(true);
    expect(data1.idempotent).toBe(false);

    // Duplicate clientId returns existing visit idempotently (status 200, 1 visit in DB)
    const createRes1Dup = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkedVisitPayload),
      })
    );
    expect(createRes1Dup.status).toBe(200);
    const data1Dup = await createRes1Dup.json();
    expect(data1Dup.idempotent).toBe(true);
    expect(String(data1Dup.visit._id)).toBe(String(data1.visit._id));
    expect(await Visit.countDocuments({ schoolId: schoolA._id })).toBe(1);

    // 2. Unlinked student (or mix of linked + unlinked) -> server computes isApproved = false,
    // ignores client-sent isApproved: true, and blocks save without reasonCode
    const blockedRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-uuid-unlinked-blocked',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          studentIds: [String(studentLinked._id), String(studentUnlinked._id)],
          purpose: 'Meet student',
          isApproved: true, // Client tries to spoof true!
        }),
      })
    );
    expect(blockedRes.status).toBe(400);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.isApproved).toBe(false);

    // Selecting reasonCode = 'Other' without reasonText >= 5 chars also returns 400
    const otherShortRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-uuid-unlinked-other-short',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          studentIds: [String(studentLinked._id), String(studentUnlinked._id)],
          purpose: 'Meet student',
          reasonCode: 'Other',
          reasonText: 'abc',
          isApproved: true,
        }),
      })
    );
    expect(otherShortRes.status).toBe(400);

    // Succeeds when reasonCode = 'Other' with reasonText >= 5 chars is provided, and stores reasonCode + reasonText
    const unapprovedOkRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-uuid-unlinked-ok',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          studentIds: [String(studentLinked._id), String(studentUnlinked._id)],
          purpose: 'Meet student',
          reasonCode: 'Other',
          reasonText: 'Confirmed with class teacher over phone',
          isApproved: true, // Spoofed true is still ignored!
        }),
      })
    );
    expect(unapprovedOkRes.status).toBe(201);
    const unapprovedOkData = await unapprovedOkRes.json();
    expect(unapprovedOkData.visit.isApproved).toBe(false);
    expect(unapprovedOkData.visit.reasonCode).toBe('Other');
    expect(unapprovedOkData.visit.reasonText).toBe(
      'Confirmed with class teacher over phone'
    );

    // Chip reasonCode = 'Relative' (non-Other) succeeds without reasonText
    const chipRelativeRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-uuid-unlinked-relative',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          studentIds: [String(studentUnlinked._id)],
          purpose: 'Meet student',
          reasonCode: 'Relative',
        }),
      })
    );
    expect(chipRelativeRes.status).toBe(201);
    const chipRelativeData = await chipRelativeRes.json();
    expect(chipRelativeData.visit.isApproved).toBe(false);
    expect(chipRelativeData.visit.reasonCode).toBe('Relative');

    // 3. Guard of School A cannot create a visit for a School B student or sign an upload for School B
    const crossVisitRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-cross-school',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          studentIds: [String(studentInSchoolB._id)],
          purpose: 'Pickup',
          reasonCode: 'Relative',
        }),
      })
    );
    expect(crossVisitRes.status).toBe(403);

    const crossUploadRes = await signUploadRoute(
      new NextRequest('http://localhost:3000/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolB._id),
          contentType: 'image/jpeg',
          contentLength: 50_000,
        }),
      })
    );
    expect(crossUploadRes.status).toBe(403);

    const validUploadRes = await signUploadRoute(
      new NextRequest('http://localhost:3000/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          contentType: 'image/jpeg',
          contentLength: 120_000,
        }),
      })
    );
    expect(validUploadRes.status).toBe(200);
    const validUploadData = await validUploadRes.json();
    expect(validUploadData.photoKey).toMatch(
      new RegExp(`^${String(schoolA._id)}/visitors/.+\\.jpg$`)
    );

    // Signing GET for another school's photoKey is also forbidden (403)
    const crossGetPhotoRes = await signGetUploadRoute(
      new NextRequest(
        `http://localhost:3000/api/uploads/sign?schoolId=${String(schoolA._id)}&photoKey=${String(schoolB._id)}/visitors/other.jpg`
      )
    );
    expect(crossGetPhotoRes.status).toBe(403);
  });

  it('marks exit on open visits, writes visit.exit audit log, and auto-closes only open visits via cron', async () => {
    const { schoolA, guardAId } = await seedTwoSchools();

    const student = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-E1',
      name: 'Aarav Kumar',
      className: '5',
      section: 'A',
    });
    const visitor = await Visitor.create({
      schoolId: schoolA._id,
      name: 'Rakesh Kumar',
      phone: '9876543210',
    });

    const visit1 = await Visit.create({
      schoolId: schoolA._id,
      clientId: 'visit-exit-1',
      visitorId: visitor._id,
      studentIds: [student._id],
      purpose: 'Pickup',
      isApproved: true,
      entryAt: new Date(),
      exitAt: null,
      checkedInBy: guardAId,
    });

    const visit2 = await Visit.create({
      schoolId: schoolA._id,
      clientId: 'visit-autoclose-2',
      visitorId: visitor._id,
      studentIds: [student._id],
      purpose: 'Meet student',
      isApproved: true,
      entryAt: new Date(),
      exitAt: null,
      checkedInBy: guardAId,
    });

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

    // Inside Now lists both open visits
    const insideRes = await listInsideVisitsRoute(
      new NextRequest(
        `http://localhost:3000/api/gate/visits/inside?schoolId=${String(schoolA._id)}`
      )
    );
    expect(insideRes.status).toBe(200);
    const insideData = await insideRes.json();
    expect(insideData.visits).toHaveLength(2);

    // Manually exit visit1 with leftWithStudent: true
    const exitRes = await markVisitExitRoute(
      new NextRequest(
        `http://localhost:3000/api/gate/visits/${String(visit1._id)}/exit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolId: String(schoolA._id),
            leftWithStudent: true,
          }),
        }
      ),
      { params: Promise.resolve({ visitId: String(visit1._id) }) }
    );
    expect(exitRes.status).toBe(200);
    const exitData = await exitRes.json();
    expect(exitData.visit.exitAt).not.toBeNull();
    expect(exitData.visit.leftWithStudent).toBe(true);
    expect(exitData.visit.autoClosed).toBe(false);

    // AuditLog recorded visit.exit
    const exitAudit = await AuditLog.findOne({
      schoolId: schoolA._id,
      action: 'visit.exit',
      entityId: visit1._id,
    }).lean();
    expect(exitAudit).not.toBeNull();

    // Auto-close cron job (at 18:00 IST = 12:30 UTC) closes only visit2 (still open) and flags autoClosed: true
    process.env.CRON_SECRET = 'test-cron-secret';
    const cronRes = await cronCloseVisitsRoute(
      new NextRequest(
        'http://localhost:3000/api/cron/close-visits?now=2026-10-30T12:30:00.000Z',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      )
    );
    expect(cronRes.status).toBe(200);
    const cronData = await cronRes.json();
    expect(cronData.closedCount).toBe(1);

    const v1After = await Visit.findById(visit1._id).lean();
    const v2After = await Visit.findById(visit2._id).lean();
    expect(v1After?.autoClosed).toBe(false);
    expect(v2After?.exitAt).not.toBeNull();
    expect(v2After?.autoClosed).toBe(true);

    // Also verify MongoRateLimiter persists buckets in rateLimits collection
    const mongoLimiter = new MongoRateLimiter();
    const r1 = await mongoLimiter.consume('test-mongo-key', 2, 60_000, 1000);
    const r2 = await mongoLimiter.consume('test-mongo-key', 2, 60_000, 2000);
    const r3 = await mongoLimiter.consume('test-mongo-key', 2, 60_000, 3000);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
  });

  it('bulk imports students with guardian columns (including siblings sharing a parent phone and conflict counting without overwriting)', async () => {
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

    // Sibling 1 and Sibling 2 share fatherPhone (9876543210, same name "Rakesh Kumar")
    // and motherPhone (9876543211, but Sibling 2 has a conflicting name "Suman Devi" vs "Sunita Devi").
    // Sibling 2 also has an Uncle guardian (9876543212).
    const csvWithGuardians = [
      'admissionNo,name,className,section,rollNumber,fatherName,fatherPhone,motherName,motherPhone,guardianName,guardianPhone,guardianRelation',
      'ADM-G1,Aarav Kumar,5,A,1,Rakesh Kumar,9876543210,Sunita Devi,9876543211,,,',
      'ADM-G2,Ananya Kumar,7,B,2,Rakesh Kumar,9876543210,Suman Devi,9876543211,Manoj Kumar,9876543212,Uncle',
    ].join('\n');

    const fd = new FormData();
    fd.append(
      'file',
      new File([csvWithGuardians], 'siblings-guardians.csv', {
        type: 'text/csv',
      })
    );
    fd.append('mode', 'commit');

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
    expect(res.status).toBe(200);
    const report = await res.json();

    expect(report.created).toBe(2);
    expect(report.failed).toBe(0);
    // 3 unique visitors created: Father (9876543210), Mother (9876543211), Uncle (9876543212)
    expect(report.guardiansCreated).toBe(3);
    // 5 guardian links created: Row 1 has 2 (Father, Mother), Row 2 has 3 (Father, Mother, Uncle)
    expect(report.guardiansLinked).toBe(5);
    // 1 conflict on Row 2 motherPhone (Sunita Devi vs Suman Devi)
    expect(report.guardianConflicts).toBe(1);

    expect(report.rows[0]).toMatchObject({
      admissionNo: 'ADM-G1',
      status: 'created',
      guardiansCreated: 2,
      guardiansLinked: 2,
      guardianConflicts: 0,
    });
    expect(report.rows[1]).toMatchObject({
      admissionNo: 'ADM-G2',
      status: 'created',
      guardiansCreated: 1,
      guardiansLinked: 3,
      guardianConflicts: 1,
    });

    // Verify existing visitor name ("Sunita Devi") was NOT overwritten by "Suman Devi"
    const motherVisitor = await Visitor.findOne({
      schoolId: schoolA._id,
      phone: '9876543211',
    }).lean();
    expect(motherVisitor?.name).toBe('Sunita Devi');

    // Both siblings are linked to the same Father Visitor document
    const fatherVisitor = await Visitor.findOne({
      schoolId: schoolA._id,
      phone: '9876543210',
    }).lean();
    expect(fatherVisitor).not.toBeNull();
    const fatherLinks = await GuardianLink.find({
      schoolId: schoolA._id,
      visitorId: fatherVisitor?._id,
      approved: true,
    }).lean();
    expect(fatherLinks).toHaveLength(2);

    // Template endpoint includes the new guardian columns
    const templateRes = await downloadTemplateRoute(
      new NextRequest(
        `http://localhost:3000/api/schools/${String(schoolA._id)}/students/template?locale=en`
      ),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );
    const templateCsv = await templateRes.text();
    expect(templateCsv).toContain(
      'admissionNo,name,className,section,rollNumber,fatherName,fatherPhone,motherName,motherPhone,guardianName,guardianPhone,guardianRelation'
    );
  });

  it('validates photoKey via HeadObject on visit save (must start with schoolId/, exist, and be <= 1 MB) and verifies Netlify scheduled function', async () => {
    const { schoolA, schoolB, guardAId } = await seedTwoSchools();

    const student = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'ADM-P1',
      name: 'Aarav Kumar',
      className: '5',
      section: 'A',
    });

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

    // 1. Upload sign rejects > 1 MB (400)
    const signTooLargeRes = await signUploadRoute(
      new NextRequest('http://localhost:3000/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          contentType: 'image/jpeg',
          contentLength: 1_500_000,
        }),
      })
    );
    expect(signTooLargeRes.status).toBe(400);

    // 2. Visit save with photoKey not starting with `${schoolId}/` -> 400
    const wrongPrefixRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-photo-wrong-prefix',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          photoKey: `${String(schoolB._id)}/visitors/other.jpg`,
          studentIds: [String(student._id)],
          purpose: 'Pickup',
          reasonCode: 'Relative',
        }),
      })
    );
    expect(wrongPrefixRes.status).toBe(400);

    // 3. Visit save when HeadObject reports object does NOT exist -> 400
    setHeadObjectInspector(async () => ({
      exists: false,
      contentLength: 0,
    }));
    const missingObjRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-photo-missing-obj',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          photoKey: `${String(schoolA._id)}/visitors/missing.jpg`,
          studentIds: [String(student._id)],
          purpose: 'Pickup',
          reasonCode: 'Relative',
        }),
      })
    );
    expect(missingObjRes.status).toBe(400);

    // 4. Visit save when HeadObject reports object > 1 MB -> 400
    setHeadObjectInspector(async () => ({
      exists: true,
      contentLength: 1_048_577, // 1 MB + 1 byte
      contentType: 'image/jpeg',
    }));
    const oversizeObjRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-photo-oversize-obj',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          photoKey: `${String(schoolA._id)}/visitors/oversize.jpg`,
          studentIds: [String(student._id)],
          purpose: 'Pickup',
          reasonCode: 'Relative',
        }),
      })
    );
    expect(oversizeObjRes.status).toBe(400);

    // 5. Visit save when HeadObject reports existing object <= 1 MB -> 201
    setHeadObjectInspector(async () => ({
      exists: true,
      contentLength: 145_000,
      contentType: 'image/jpeg',
    }));
    const validPhotoVisitRes = await createGateVisitRoute(
      new NextRequest('http://localhost:3000/api/gate/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: String(schoolA._id),
          clientId: 'visit-photo-valid-obj',
          phone: '9876543210',
          name: 'Rakesh Kumar',
          photoKey: `${String(schoolA._id)}/visitors/valid.jpg`,
          studentIds: [String(student._id)],
          purpose: 'Pickup',
          reasonCode: 'Relative',
        }),
      })
    );
    expect(validPhotoVisitRes.status).toBe(201);

    // 6. Verify Netlify Scheduled Function schedule is 17:05 IST (11:35 UTC = '35 11 * * *') and handler works
    expect(closeVisitsScheduleConfig.schedule).toBe('35 11 * * *');
    const scheduledRes = await closeVisitsScheduledHandler();
    expect(scheduledRes.status).toBe(200);
  });

  it('renders "/" without auth, redirects "/app" by role or to "/login" when logged out, and sets manifest start_url to "/app"', async () => {
    // 1. Manifest has start_url "/app" and scope "/"
    const manifestData = manifest();
    expect(manifestData.start_url).toBe('/app');
    expect(manifestData.scope).toBe('/');

    // 2. "/" renders without auth (no redirect thrown)
    mockAuth.mockResolvedValue(null);
    const landingElement = await MarketingLandingPage();
    expect(landingElement).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();

    // 3. "/app" redirects to "/login" when logged out
    await expect(AppRedirectPage()).rejects.toThrow('NEXT_REDIRECT:/login');

    // 4. "/app" redirects guard -> "/gate"
    mockAuth.mockResolvedValue({
      user: {
        id: 'u-guard',
        phone: '9800000003',
        role: 'guard',
        schoolIds: ['SCH-A'],
        tokenVersion: 0,
      },
    });
    await expect(AppRedirectPage()).rejects.toThrow('NEXT_REDIRECT:/gate');

    // 5. "/app" redirects principal -> "/dashboard"
    mockAuth.mockResolvedValue({
      user: {
        id: 'u-principal',
        phone: '9800000002',
        role: 'principal',
        schoolIds: ['SCH-A'],
        tokenVersion: 0,
      },
    });
    await expect(AppRedirectPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');

    // 6. "/app" redirects super_admin -> "/dashboard"
    mockAuth.mockResolvedValue({
      user: {
        id: 'u-super',
        phone: '9800000001',
        role: 'super_admin',
        schoolIds: [],
        tokenVersion: 0,
      },
    });
    await expect(AppRedirectPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it('saves valid leads, silently rejects honeypot submissions, rate-limits the 6th submission per IP per hour with 429, and enforces 403 for non-super_admin on /admin/leads', async () => {
    const { schoolA } = await seedTwoSchools();

    // 1. Valid submission is saved to leads collection
    const validRes = await createLeadRoute(
      new NextRequest('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
          name: 'Rajesh Verma',
          schoolName: 'GPS Kakori',
          role: 'Principal',
          phone: '9876543210',
          message: 'Interested in starting a pilot next month.',
          website: '',
        }),
      })
    );
    expect(validRes.status).toBe(201);
    expect(await Lead.countDocuments({})).toBe(1);

    // 2. Honeypot filled -> rejected silently (200 OK, not saved to DB)
    const honeypotRes = await createLeadRoute(
      new NextRequest('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.11',
        },
        body: JSON.stringify({
          name: 'Spam Bot',
          schoolName: 'Bot School',
          role: 'Bot',
          phone: '9876543211',
          message: 'Buy links',
          website: 'https://spambot.example.com',
        }),
      })
    );
    expect(honeypotRes.status).toBe(200);
    expect(await Lead.countDocuments({})).toBe(1);

    // 3. Rate limit: 5 submissions from same IP in an hour succeed; 6th returns 429
    const testIp = '203.0.113.55';
    for (let i = 1; i <= 5; i++) {
      const res = await createLeadRoute(
        new NextRequest('http://localhost:3000/api/leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': testIp,
          },
          body: JSON.stringify({
            name: `Teacher ${i}`,
            schoolName: `School ${i}`,
            role: 'Principal',
            phone: `987654320${i}`,
            message: 'Pilot request',
          }),
        })
      );
      expect(res.status).toBe(201);
    }

    const sixthRes = await createLeadRoute(
      new NextRequest('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': testIp,
        },
        body: JSON.stringify({
          name: 'Teacher 6',
          schoolName: 'School 6',
          role: 'Principal',
          phone: '9876543206',
          message: 'Pilot request 6',
        }),
      })
    );
    expect(sixthRes.status).toBe(429);

    // 4. Non-super_admin gets 403 on /admin/leads (both principal and guard)
    const principalUser = await User.create({
      name: 'Principal A',
      phone: '9811112222',
      passwordHash: 'hash',
      role: 'principal',
      schoolIds: [String(schoolA._id)],
      isActive: true,
    });
    mockAuth.mockResolvedValue({
      user: {
        id: String(principalUser._id),
        phone: principalUser.phone,
        role: 'principal',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });
    const principalLeadsRes = await listAdminLeadsRoute();
    expect(principalLeadsRes.status).toBe(403);

    const guardUser = await User.create({
      name: 'Guard A',
      phone: '9811113333',
      passwordHash: 'hash',
      role: 'guard',
      schoolIds: [String(schoolA._id)],
      isActive: true,
    });
    mockAuth.mockResolvedValue({
      user: {
        id: String(guardUser._id),
        phone: guardUser.phone,
        role: 'guard',
        schoolIds: [String(schoolA._id)],
        tokenVersion: 0,
      },
    });
    const guardLeadsRes = await listAdminLeadsRoute();
    expect(guardLeadsRes.status).toBe(403);

    // 5. super_admin gets 200 and sees all saved leads
    const superAdmin = await User.create({
      name: 'Super Admin',
      phone: '9811110000',
      passwordHash: 'hash',
      role: 'super_admin',
      schoolIds: [],
      isActive: true,
    });
    mockAuth.mockResolvedValue({
      user: {
        id: String(superAdmin._id),
        phone: superAdmin.phone,
        role: 'super_admin',
        schoolIds: [],
        tokenVersion: 0,
      },
    });
    const superLeadsRes = await listAdminLeadsRoute();
    expect(superLeadsRes.status).toBe(200);
    const superLeadsJson = (await superLeadsRes.json()) as {
      leads: Array<{ schoolName: string }>;
    };
    expect(superLeadsJson.leads.length).toBe(6);
  });
});
