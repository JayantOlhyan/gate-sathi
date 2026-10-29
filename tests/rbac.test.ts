import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
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
  AuthLockoutError,
} from '@/lib/auth-service';
import {
  School,
  User,
  Student,
  Visitor,
  GuardianLink,
  Visit,
  AuditLog,
} from '@/models';

describe('GateSathi Phase 1 — RBAC & Foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives a guard of School A a 403 Forbidden on any School B resource', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'guard-user-1',
        name: 'Ramesh Tiwari',
        phone: '9999999992',
        role: 'guard',
        schoolIds: ['school-a'],
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
  });

  it('prevents a guard from hitting admin routes (403 Forbidden)', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'guard-user-1',
        name: 'Ramesh Tiwari',
        phone: '9999999992',
        role: 'guard',
        schoolIds: ['school-a'],
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

  it('allows principal of School A to hit admin routes for School A, but returns 403 for School B', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'principal-user-1',
        name: 'Rajeshwari Mishra',
        phone: '9999999991',
        role: 'principal',
        schoolIds: ['school-a'],
      },
    });

    const okReq = new NextRequest(
      'http://localhost:3000/api/admin/overview?schoolId=school-a'
    );
    const okRes = await getAdminOverview(okReq);
    expect(okRes.status).toBe(200);

    const forbiddenReq = new NextRequest(
      'http://localhost:3000/api/admin/overview?schoolId=school-b'
    );
    const forbiddenRes = await getAdminOverview(forbiddenReq);
    expect(forbiddenRes.status).toBe(403);
  });

  it('enforces that every model except User has schoolId', () => {
    const modelsWithSchoolId = [School, Student, Visitor, GuardianLink, Visit, AuditLog];
    for (const model of modelsWithSchoolId) {
      expect(model.schema.paths.schoolId).toBeDefined();
    }
    expect(User.schema.paths.schoolId).toBeUndefined();
    expect(User.schema.paths.schoolIds).toBeDefined();
  });

  it('locks login for 15 minutes after 5 failed attempts', async () => {
    const passwordHash = await bcrypt.hash('Correct@123', 4);
    const mockUserDoc = {
      _id: 'user-1',
      name: 'Ramesh Tiwari',
      phone: '9999999992',
      passwordHash,
      role: 'guard' as const,
      schoolIds: ['school-a'],
      failedLoginAttempts: 0,
      lockUntil: null as Date | null,
      isActive: true,
      save: vi.fn().mockResolvedValue(undefined),
    };

    const findOneSpy = vi
      .spyOn(User, 'findOne')
      .mockResolvedValue(mockUserDoc as unknown as InstanceType<typeof User>);

    // Attempts 1 to 4 return null and increment failedLoginAttempts
    for (let i = 1; i <= 4; i++) {
      const res = await authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'WrongPassword' },
        { skipDbConnect: true }
      );
      expect(res).toBeNull();
      expect(mockUserDoc.failedLoginAttempts).toBe(i);
      expect(mockUserDoc.lockUntil).toBeNull();
    }

    // Attempt 5 triggers the 15-minute lockout
    const beforeLock = Date.now();
    await expect(
      authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'WrongPassword' },
        { skipDbConnect: true }
      )
    ).rejects.toBeInstanceOf(AuthLockoutError);

    expect(mockUserDoc.failedLoginAttempts).toBe(5);
    expect(mockUserDoc.lockUntil).toBeInstanceOf(Date);
    const lockDurationMs = (mockUserDoc.lockUntil as Date).getTime() - beforeLock;
    expect(lockDurationMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);

    // Even with the right password during lock window, login stays locked
    await expect(
      authenticateWithPhoneAndPassword(
        { phone: '9999999992', password: 'Correct@123' },
        { skipDbConnect: true }
      )
    ).rejects.toBeInstanceOf(AuthLockoutError);

    findOneSpy.mockRestore();
  });
});
