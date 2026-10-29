import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const mockAuth = vi.fn();

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/db', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/models/Student', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/models/Student')>();
  return {
    ...actual,
    Student: {
      schema: actual.Student.schema,
      find: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              admissionNo: 'ADM-2026-001',
              name: 'Aarav Kumar',
              className: '5',
              section: 'A',
              rollNumber: '101',
              schoolId: 'school-a',
            },
          ]),
        }),
      }),
    },
  };
});

import { requireRole, requireSchoolAccess, RbacError } from '@/lib/rbac';
import { GET as getSchoolStudents } from '@/app/api/schools/[schoolId]/students/route';
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
  isVisitInside,
  DuplicateVisitClientIdError,
} from '@/models';

describe('GateSathi Phase 1 — RBAC, Models, Rate Limit & Session Revocation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await getRateLimiter().clearAll();
  });

  it('gives a guard of School A a 403 Forbidden on any School B resource', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'guard-user-1',
        name: 'Ramesh Tiwari',
        phone: '9999999992',
        role: 'guard',
        schoolIds: ['school-a'],
        tokenVersion: 0,
      },
    });

    await expect(requireSchoolAccess('school-b')).rejects.toMatchObject({
      status: 403,
    });

    const req = new NextRequest('http://localhost:3000/api/schools/school-b/students');
    const res = await getSchoolStudents(req, {
      params: Promise.resolve({ schoolId: 'school-b' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('allows a guard of School A to access a School A resource (200 OK)', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'guard-user-1',
        name: 'Ramesh Tiwari',
        phone: '9999999992',
        role: 'guard',
        schoolIds: ['school-a'],
        tokenVersion: 0,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/schools/school-a/students');
    const res = await getSchoolStudents(req, {
      params: Promise.resolve({ schoolId: 'school-a' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schoolId).toBe('school-a');
    expect(body.students).toHaveLength(1);
    expect(body.students[0].admissionNo).toBe('ADM-2026-001');
  });

  it('prevents a guard from hitting admin routes (403 Forbidden)', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'guard-user-1',
        name: 'Ramesh Tiwari',
        phone: '9999999992',
        role: 'guard',
        schoolIds: ['school-a'],
        tokenVersion: 0,
      },
    });

    await expect(requireRole('super_admin', 'principal')).rejects.toBeInstanceOf(
      RbacError
    );
    await expect(requireRole('super_admin', 'principal')).rejects.toMatchObject({
      status: 403,
    });

    const req = new NextRequest(
      'http://localhost:3000/api/admin/overview?schoolId=school-a'
    );
    const res = await getAdminOverview(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('enforces Student {schoolId, admissionNo} unique index and Visit schema/indexes', async () => {
    const modelsWithSchoolId = [School, Student, Visitor, GuardianLink, Visit, AuditLog];
    for (const model of modelsWithSchoolId) {
      expect(model.schema.paths.schoolId).toBeDefined();
    }
    expect(User.schema.paths.schoolId).toBeUndefined();
    expect(User.schema.paths.schoolIds).toBeDefined();
    expect(User.schema.paths.tokenVersion).toBeDefined();

    // Student indexes: {schoolId: 1, admissionNo: 1} unique, {schoolId: 1, name: 1}
    const studentIndexes = Student.schema.indexes();
    expect(studentIndexes).toEqual(
      expect.arrayContaining([
        [{ schoolId: 1, admissionNo: 1 }, expect.objectContaining({ unique: true })],
        [{ schoolId: 1, name: 1 }, expect.any(Object)],
      ])
    );

    // Visit schema: no stored status, derives inside from exitAt === null, studentIds min 1
    expect(Visit.schema.paths.status).toBeUndefined();
    expect(Visit.schema.paths.entryAt).toBeDefined();
    expect(Visit.schema.paths.exitAt).toBeDefined();
    expect(Visit.schema.paths.clientId).toBeDefined();
    expect(Visit.schema.paths.studentIds).toBeDefined();
    expect(isVisitInside({ exitAt: null })).toBe(true);
    expect(isVisitInside({ exitAt: new Date() })).toBe(false);

    const visitIndexes = Visit.schema.indexes();
    expect(visitIndexes).toEqual(
      expect.arrayContaining([
        [{ schoolId: 1, clientId: 1 }, expect.objectContaining({ unique: true })],
        [{ schoolId: 1, entryAt: -1 }, expect.any(Object)],
        [{ schoolId: 1, exitAt: 1 }, expect.any(Object)],
        [{ schoolId: 1, studentIds: 1 }, expect.any(Object)],
        [{ schoolId: 1, visitorId: 1, entryAt: -1 }, expect.any(Object)],
      ])
    );

    // Visit with empty studentIds fails validation
    const invalidVisit = new Visit({
      schoolId: new mongoose.Types.ObjectId(),
      clientId: 'client-empty',
      visitorId: new mongoose.Types.ObjectId(),
      studentIds: [],
      purpose: 'student_pickup',
      checkedInBy: new mongoose.Types.ObjectId(),
    });
    await expect(invalidVisit.validate()).rejects.toThrow(/studentIds/);
  });

  it('rejects a second visit with the same clientId for the same school', async () => {
    const schoolId = new mongoose.Types.ObjectId();
    const visitorId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const guardId = new mongoose.Types.ObjectId();

    const storedVisits: Array<{ schoolId: string; clientId: string }> = [];

    const findOneSpy = vi.spyOn(Visit, 'findOne').mockImplementation(((query: {
      schoolId: unknown;
      clientId: string;
    }) => {
      const match = storedVisits.find(
        (v) =>
          v.schoolId === String(query.schoolId) && v.clientId === query.clientId
      );
      return Promise.resolve(match ?? null) as unknown as ReturnType<
        typeof Visit.findOne
      >;
    }) as unknown as typeof Visit.findOne);

    const createSpy = vi.spyOn(Visit, 'create').mockImplementation(((doc: {
      schoolId: unknown;
      clientId: string;
    }) => {
      storedVisits.push({
        schoolId: String(doc.schoolId),
        clientId: doc.clientId,
      });
      return Promise.resolve(new Visit(doc)) as unknown as ReturnType<
        typeof Visit.create
      >;
    }) as unknown as typeof Visit.create);

    const firstVisit = await recordVisit({
      schoolId,
      clientId: 'offline-uuid-001',
      visitorId,
      studentIds: [studentId],
      purpose: 'student_pickup',
      checkedInBy: guardId,
    });
    expect(firstVisit.clientId).toBe('offline-uuid-001');
    expect(firstVisit.isInside).toBe(true);

    await expect(
      recordVisit({
        schoolId,
        clientId: 'offline-uuid-001',
        visitorId,
        studentIds: [studentId],
        purpose: 'student_pickup',
        checkedInBy: guardId,
      })
    ).rejects.toBeInstanceOf(DuplicateVisitClientIdError);

    findOneSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('revokes session access within 5 minutes when user is deactivated or tokenVersion changes', async () => {
    expect(authConfig.session.maxAge).toBe(8 * 60 * 60);
    expect(SESSION_MAX_AGE_SECONDS).toBe(28800);

    const t0 = 1_700_000_000_000;
    const initialToken = await verifyAndRefreshJwtToken(
      {},
      {
        id: 'user-1',
        name: 'Ramesh Tiwari',
        phone: '9999999992',
        role: 'guard',
        schoolIds: ['school-a'],
        tokenVersion: 0,
      },
      { nowMs: t0, skipDbConnect: true }
    );

    expect(initialToken.invalidated).toBe(false);
    expect(initialToken.tokenVersion).toBe(0);

    let dbUserState: {
      isActive: boolean;
      tokenVersion: number;
      role: 'guard';
      schoolIds: string[];
    } = {
      isActive: false, // User gets deactivated in DB
      tokenVersion: 0,
      role: 'guard',
      schoolIds: ['school-a'],
    };

    const findByIdSpy = vi.spyOn(User, 'findById').mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(async () => dbUserState),
      }),
    } as unknown as ReturnType<typeof User.findById>);

    // At t0 + 2 minutes (before 5-minute interval): cached token is returned without DB hit
    const tokenAt2Min = await verifyAndRefreshJwtToken(initialToken, undefined, {
      nowMs: t0 + 2 * 60 * 1000,
      skipDbConnect: true,
    });
    expect(tokenAt2Min.invalidated).toBe(false);
    expect(findByIdSpy).not.toHaveBeenCalled();

    // At t0 + 5 minutes: DB re-check runs and invalidates the deactivated user's token
    const tokenAt5Min = await verifyAndRefreshJwtToken(tokenAt2Min, undefined, {
      nowMs: t0 + TOKEN_RECHECK_INTERVAL_MS,
      skipDbConnect: true,
    });
    expect(findByIdSpy).toHaveBeenCalledTimes(1);
    expect(tokenAt5Min.invalidated).toBe(true);
    expect(tokenAt5Min.id).toBeUndefined();

    // Also verify tokenVersion mismatch invalidates an active user
    dbUserState = {
      isActive: true,
      tokenVersion: 1, // Incremented in DB
      role: 'guard',
      schoolIds: ['school-a'],
    };
    const tokenMismatch = await verifyAndRefreshJwtToken(initialToken, undefined, {
      nowMs: t0 + TOKEN_RECHECK_INTERVAL_MS,
      skipDbConnect: true,
    });
    expect(tokenMismatch.invalidated).toBe(true);

    findOneRestore(findByIdSpy);
  });

  it('rate limits a 6th attempt from the same phone+IP, but allows login from another IP', async () => {
    const passwordHash = await bcrypt.hash('Correct@123', 4);
    const mockUserDoc = {
      _id: 'user-1',
      name: 'Ramesh Tiwari',
      phone: '9999999992',
      passwordHash,
      role: 'guard' as const,
      schoolIds: ['school-a'],
      tokenVersion: 0,
      isActive: true,
    };

    const findOneSpy = vi
      .spyOn(User, 'findOne')
      .mockResolvedValue(mockUserDoc as unknown as InstanceType<typeof User>);

    const attackerIp = '203.0.113.10';
    const legitimateDeviceIp = '198.51.100.42';

    // 5 failed attempts from attackerIp return null
    for (let i = 1; i <= 5; i++) {
      const res = await authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'WrongPassword' },
        { ip: attackerIp, skipDbConnect: true }
      );
      expect(res).toBeNull();
    }

    // 6th attempt from the same phone+IP is blocked by RateLimitError
    await expect(
      authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'Correct@123' },
        { ip: attackerIp, skipDbConnect: true }
      )
    ).rejects.toBeInstanceOf(RateLimitError);

    // Another device on a different IP is NOT locked out and logs in cleanly
    const validUser = await authenticateWithPhoneAndPassword(
      { phone: '9999999992', password: 'Correct@123' },
      { ip: legitimateDeviceIp, skipDbConnect: true }
    );
    expect(validUser).not.toBeNull();
    expect(validUser?.id).toBe('user-1');

    findOneSpy.mockRestore();
  });

  it('refuses to run the seed script when NODE_ENV=production', () => {
    expect(() => assertNotProduction('production')).toThrow(
      /NODE_ENV=production/
    );
    expect(() => assertNotProduction('development')).not.toThrow();
  });
});

function findOneRestore(spy: { mockRestore: () => void }) {
  spy.mockRestore();
}
