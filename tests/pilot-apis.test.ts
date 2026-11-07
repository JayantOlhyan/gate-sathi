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

const mockAuth = vi.fn();

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { connectDB } from '@/lib/db';
import { School } from '@/models/School';
import { User } from '@/models/User';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import { Visit } from '@/models/Visit';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { GET as getStatsToday } from '@/app/api/schools/[schoolId]/stats/today/route';
import { GET as getVisitsToday } from '@/app/api/schools/[schoolId]/visits/today/route';
import { GET as getRecentApprovals } from '@/app/api/gate/approvals/recent/route';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    const col = collections[key];
    if (col) {
      await col.deleteMany({});
    }
  }
  vi.clearAllMocks();
});

describe('Pilot UI APIs — stats/today, visits/today, gate/approvals/recent', () => {
  it('GET /api/schools/[schoolId]/stats/today enforces role and schoolId scoping and returns accurate counts', async () => {
    const schoolA = await School.create({
      schoolId: 'SCH-A',
      name: 'School A',
      udiseCode: '07010100101',
      district: 'South West',
      state: 'Delhi',
    });
    const schoolB = await School.create({
      schoolId: 'SCH-B',
      name: 'School B',
      udiseCode: '07010100102',
      district: 'South West',
      state: 'Delhi',
    });

    const principalA = await User.create({
      name: 'Principal A',
      phone: '9911111111',
      passwordHash: 'hash',
      role: 'principal',
      schoolIds: [schoolA._id],
      isActive: true,
    });
    const guardA = await User.create({
      name: 'Guard A',
      phone: '9911111112',
      passwordHash: 'hash',
      role: 'guard',
      schoolIds: [schoolA._id],
      isActive: true,
    });

    const studentA = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'A-101',
      name: 'Aarav Kumar',
      className: '5',
      section: 'A',
      isActive: true,
    });
    const visitorA = await Visitor.create({
      schoolId: schoolA._id,
      phone: '9876543210',
      name: 'Rakesh Kumar',
      defaultRelation: 'Father',
    });

    // 1 inside visit (approved pickup today)
    await Visit.create({
      schoolId: schoolA._id,
      clientId: 'c-1',
      visitorId: visitorA._id,
      studentIds: [studentA._id],
      purpose: 'Pickup',
      isApproved: true,
      pickupBlocked: false,
      entryAt: new Date(),
      exitAt: null,
      checkedInBy: guardA._id,
    });

    // 1 exited visit today
    const exitedVisit = await Visit.create({
      schoolId: schoolA._id,
      clientId: 'c-2',
      visitorId: visitorA._id,
      studentIds: [studentA._id],
      purpose: 'Meet student',
      isApproved: true,
      pickupBlocked: false,
      entryAt: new Date(),
      exitAt: new Date(),
      checkedInBy: guardA._id,
    });

    // 1 pending approval request in school A
    await ApprovalRequest.create({
      schoolId: schoolA._id,
      visitId: exitedVisit._id,
      studentId: studentA._id,
      visitorId: visitorA._id,
      status: 'pending',
      requestedBy: guardA._id,
    });

    // Guard is forbidden (403)
    mockAuth.mockResolvedValue({
      user: {
        id: String(guardA._id),
        role: 'guard',
        schoolIds: [String(schoolA._id)],
      },
    });
    const forbiddenRes = await getStatsToday(
      new NextRequest(`http://localhost:3000/api/schools/${schoolA._id}/stats/today`),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );
    expect(forbiddenRes.status).toBe(403);

    // Principal A is forbidden on School B (403)
    mockAuth.mockResolvedValue({
      user: {
        id: String(principalA._id),
        role: 'principal',
        schoolIds: [String(schoolA._id)],
      },
    });
    const crossSchoolRes = await getStatsToday(
      new NextRequest(`http://localhost:3000/api/schools/${schoolB._id}/stats/today`),
      { params: Promise.resolve({ schoolId: String(schoolB._id) }) }
    );
    expect(crossSchoolRes.status).toBe(403);

    // Principal A on School A succeeds (200)
    const okRes = await getStatsToday(
      new NextRequest(`http://localhost:3000/api/schools/${schoolA._id}/stats/today`),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );
    expect(okRes.status).toBe(200);
    const stats = await okRes.json();
    expect(stats).toEqual({
      insideNow: 1,
      entriesToday: 2,
      pendingApprovals: 1,
      pickupsApprovedToday: 1,
    });
  });

  it('GET /api/schools/[schoolId]/visits/today masks phone numbers, omits photos, and scopes by schoolId', async () => {
    const schoolA = await School.create({
      schoolId: 'SCH-A2',
      name: 'School A2',
      udiseCode: '07010100103',
      district: 'South West',
      state: 'Delhi',
    });
    const schoolB = await School.create({
      schoolId: 'SCH-B2',
      name: 'School B2',
      udiseCode: '07010100104',
      district: 'South West',
      state: 'Delhi',
    });

    const principalA = await User.create({
      name: 'Principal A2',
      phone: '9911111121',
      passwordHash: 'hash',
      role: 'principal',
      schoolIds: [schoolA._id],
      isActive: true,
    });
    const guardA = await User.create({
      name: 'Guard A2',
      phone: '9911111122',
      passwordHash: 'hash',
      role: 'guard',
      schoolIds: [schoolA._id],
      isActive: true,
    });

    const studentA = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'A-201',
      name: 'Diya Kumar',
      className: '2',
      section: 'B',
      isActive: true,
    });
    const visitorA = await Visitor.create({
      schoolId: schoolA._id,
      phone: '9876543210',
      name: 'Rakesh Kumar',
      photoKey: `${schoolA._id}/visitors/secret-photo.jpg`,
      defaultRelation: 'Father',
    });

    await Visit.create({
      schoolId: schoolA._id,
      clientId: 'c-10',
      visitorId: visitorA._id,
      studentIds: [studentA._id],
      purpose: 'Pickup',
      isApproved: true,
      pickupBlocked: false,
      entryAt: new Date(),
      exitAt: null,
      checkedInBy: guardA._id,
    });

    mockAuth.mockResolvedValue({
      user: {
        id: String(principalA._id),
        role: 'principal',
        schoolIds: [String(schoolA._id)],
      },
    });

    // Cross-school blocked
    const crossRes = await getVisitsToday(
      new NextRequest(`http://localhost:3000/api/schools/${schoolB._id}/visits/today`),
      { params: Promise.resolve({ schoolId: String(schoolB._id) }) }
    );
    expect(crossRes.status).toBe(403);

    // Own school succeeds
    const res = await getVisitsToday(
      new NextRequest(`http://localhost:3000/api/schools/${schoolA._id}/visits/today?limit=10`),
      { params: Promise.resolve({ schoolId: String(schoolA._id) }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.visits).toHaveLength(1);
    const row = data.visits[0];
    expect(row.visitorName).toBe('Rakesh Kumar');
    expect(row.maskedPhone).toBe('98XXXXX210');
    expect(row.phone).toBeUndefined();
    expect(row.photoKey).toBeUndefined();
    expect(row.signedPhotoUrl).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('9876543210');
    expect(JSON.stringify(row)).not.toContain('secret-photo.jpg');
  });

  it('GET /api/gate/approvals/recent enforces role and schoolId scoping and returns active + recent 30m decided requests', async () => {
    const schoolA = await School.create({
      schoolId: 'SCH-A3',
      name: 'School A3',
      udiseCode: '07010100105',
      district: 'South West',
      state: 'Delhi',
    });
    const schoolB = await School.create({
      schoolId: 'SCH-B3',
      name: 'School B3',
      udiseCode: '07010100106',
      district: 'South West',
      state: 'Delhi',
    });

    const guardA = await User.create({
      name: 'Guard A3',
      phone: '9911111132',
      passwordHash: 'hash',
      role: 'guard',
      schoolIds: [schoolA._id],
      isActive: true,
    });
    const teacherA = await User.create({
      name: 'Sunita Sharma',
      phone: '9911111133',
      passwordHash: 'hash',
      role: 'teacher',
      schoolIds: [schoolA._id],
      isActive: true,
    });

    const studentA = await Student.create({
      schoolId: schoolA._id,
      admissionNo: 'A-301',
      name: 'Aarav Kumar',
      className: '5',
      section: 'A',
      isActive: true,
    });
    const visitorA = await Visitor.create({
      schoolId: schoolA._id,
      phone: '9811122233',
      name: 'Mahesh Yadav',
      defaultRelation: 'Uncle',
    });
    const visit1 = await Visit.create({
      schoolId: schoolA._id,
      clientId: 'c-20',
      visitorId: visitorA._id,
      studentIds: [studentA._id],
      purpose: 'Pickup',
      reasonCode: 'Relative',
      isApproved: false,
      pickupBlocked: true,
      entryAt: new Date(),
      checkedInBy: guardA._id,
    });

    await ApprovalRequest.create({
      schoolId: schoolA._id,
      visitId: visit1._id,
      studentId: studentA._id,
      visitorId: visitorA._id,
      teacherId: teacherA._id,
      status: 'pending',
      requestedBy: guardA._id,
    });

    // Teacher role is not allowed on gate/approvals/recent (only guard, principal, super_admin)
    mockAuth.mockResolvedValue({
      user: {
        id: String(teacherA._id),
        role: 'teacher',
        schoolIds: [String(schoolA._id)],
      },
    });
    const teacherRes = await getRecentApprovals(
      new NextRequest(`http://localhost:3000/api/gate/approvals/recent?schoolId=${schoolA._id}`)
    );
    expect(teacherRes.status).toBe(403);

    // Guard A on School B is forbidden (403)
    mockAuth.mockResolvedValue({
      user: {
        id: String(guardA._id),
        role: 'guard',
        schoolIds: [String(schoolA._id)],
      },
    });
    const crossRes = await getRecentApprovals(
      new NextRequest(`http://localhost:3000/api/gate/approvals/recent?schoolId=${schoolB._id}`)
    );
    expect(crossRes.status).toBe(403);

    // Guard A on School A succeeds (200)
    const okRes = await getRecentApprovals(
      new NextRequest(`http://localhost:3000/api/gate/approvals/recent?schoolId=${schoolA._id}`)
    );
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].visitorName).toBe('Mahesh Yadav');
    expect(body.items[0].studentName).toBe('Aarav Kumar');
    expect(body.items[0].className).toBe('5');
    expect(body.items[0].section).toBe('A');
    expect(body.items[0].status).toBe('pending');
  });
});
