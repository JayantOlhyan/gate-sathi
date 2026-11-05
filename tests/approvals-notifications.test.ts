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
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mockAuth = vi.fn();

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'hi',
  getTranslations: async () => (key: string) => key,
}));

import { connectDB } from '@/lib/db';
import { School } from '@/models/School';
import { User } from '@/models/User';
import { Student } from '@/models/Student';
import { Visitor } from '@/models/Visitor';
import { Visit } from '@/models/Visit';
import { ApprovalRequest } from '@/models/ApprovalRequest';
import { PushSubscription } from '@/models/PushSubscription';
import { Notification } from '@/models/Notification';
import { AuditLog } from '@/models/AuditLog';
import { POST as decideApprovalRoute } from '@/app/api/schools/[schoolId]/approvals/[requestId]/decide/route';
import {
  checkAndEscalatePendingRequests,
  checkAndExpireStaleRequests,
} from '@/lib/escalate-approvals';
import { notify, processNotificationOutbox } from '@/lib/push';
import { runNotifyTick } from '@/lib/notify-tick';

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

describe('Task A: Notifications & Approvals Reliability Suite', () => {
  it('A2: decide is idempotent under two concurrent calls: exactly one succeeds, the other gets 409', async () => {
    const school = await School.create({
      schoolId: 'TEST-SCH-01',
      name: 'Delhi Model School',
      udiseCode: '07010100101',
      district: 'Central',
      state: 'Delhi',
      teacherApprovalEscalationMinutes: 5,
    });

    const teacher = await User.create({
      name: 'Anita Teacher',
      phone: '9811111111',
      passwordHash: 'dummy',
      role: 'teacher',
      schoolIds: [school._id],
      classAssignments: [{ schoolId: school._id, className: '5', section: 'A' }],
      isActive: true,
    });

    const principal = await User.create({
      name: 'Principal Sharma',
      phone: '9811111112',
      passwordHash: 'dummy',
      role: 'principal',
      schoolIds: [school._id],
      isActive: true,
    });

    const student = await Student.create({
      schoolId: school._id,
      admissionNo: 'ADM-1001',
      name: 'Rahul Kumar',
      className: '5',
      section: 'A',
      isActive: true,
    });

    const visitor = await Visitor.create({
      schoolId: school._id,
      phone: '9811111113',
      name: 'Suresh Kumar',
    });

    const visit = await Visit.create({
      schoolId: school._id,
      clientId: 'client-visit-1',
      visitorId: visitor._id,
      studentIds: [student._id],
      purpose: 'Pickup',
      isApproved: false,
      pickupBlocked: true,
      entryAt: new Date(),
      checkedInBy: teacher._id,
    });

    const approvalReq = await ApprovalRequest.create({
      schoolId: school._id,
      visitId: visit._id,
      studentId: student._id,
      visitorId: visitor._id,
      teacherId: teacher._id,
      status: 'pending',
      requestedBy: teacher._id,
    });

    // Mock session for caller
    mockAuth.mockResolvedValue({
      user: {
        id: String(principal._id),
        role: 'principal',
        schoolIds: [String(school._id)],
      },
    });

    const reqBody1 = JSON.stringify({ decision: 'approve' });
    const reqBody2 = JSON.stringify({ decision: 'reject', note: 'Not permitted today' });

    const call1 = decideApprovalRoute(
      new NextRequest('http://localhost/api', { method: 'POST', body: reqBody1 }),
      { params: Promise.resolve({ schoolId: String(school._id), requestId: String(approvalReq._id) }) }
    );

    const call2 = decideApprovalRoute(
      new NextRequest('http://localhost/api', { method: 'POST', body: reqBody2 }),
      { params: Promise.resolve({ schoolId: String(school._id), requestId: String(approvalReq._id) }) }
    );

    const [res1, res2] = await Promise.all([call1, call2]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one 200, exactly one 409
    expect(statuses).toEqual([200, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    const conflictData = await conflictRes.json();
    expect(conflictData.status).toBeDefined();
    expect(conflictData.decidedBy).toBeDefined();
  });

  it('A2: escalation notifies exactly once under concurrency', async () => {
    const school = await School.create({
      schoolId: 'TEST-SCH-02',
      name: 'Delhi Model School 2',
      udiseCode: '07010100102',
      district: 'Central',
      state: 'Delhi',
      teacherApprovalEscalationMinutes: 5,
    });

    const principal = await User.create({
      name: 'Principal Two',
      phone: '9822222222',
      passwordHash: 'dummy',
      role: 'principal',
      schoolIds: [school._id],
      isActive: true,
    });

    const student = await Student.create({
      schoolId: school._id,
      admissionNo: 'ADM-1002',
      name: 'Pooja Verma',
      className: '6',
      section: 'B',
      isActive: true,
    });

    const visitor = await Visitor.create({
      schoolId: school._id,
      phone: '9822222223',
      name: 'Ramesh Verma',
    });

    const visit = await Visit.create({
      schoolId: school._id,
      clientId: 'client-visit-2',
      visitorId: visitor._id,
      studentIds: [student._id],
      purpose: 'Pickup',
      isApproved: false,
      pickupBlocked: true,
      entryAt: new Date(),
      checkedInBy: principal._id,
    });

    // Created 10 minutes ago -> overdue for 5m escalation
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const req = await ApprovalRequest.create({
      schoolId: school._id,
      visitId: visit._id,
      studentId: student._id,
      visitorId: visitor._id,
      status: 'pending',
      requestedBy: principal._id,
      createdAt: tenMinsAgo,
    });

    // Two concurrent escalation checks
    const [esc1, esc2] = await Promise.all([
      checkAndEscalatePendingRequests(school._id),
      checkAndEscalatePendingRequests(school._id),
    ]);

    expect(esc1 + esc2).toBe(1);

    // Verify document in DB is escalated
    const reloaded = await ApprovalRequest.findById(req._id);
    expect(reloaded?.status).toBe('escalated');

    // Verify exactly one notification was enqueued with dedupeKey
    const notifs = await Notification.find({ dedupeKey: `approval_escalated:${req._id}` });
    expect(notifs.length).toBe(1);
    expect(notifs[0]?.type).toBe('approval_escalated');
  });

  it('A3: outbox retries then gives up after max 5 attempts', async () => {
    const school = await School.create({
      schoolId: 'TEST-SCH-03',
      name: 'Delhi Model School 3',
      udiseCode: '07010100103',
      district: 'Central',
      state: 'Delhi',
    });

    const user = await User.create({
      name: 'Guard Three',
      phone: '9833333333',
      passwordHash: 'dummy',
      role: 'guard',
      schoolIds: [school._id],
      isActive: true,
    });

    // Has a push subscription so it attempts push
    await PushSubscription.create({
      userId: user._id,
      schoolId: school._id,
      endpoint: 'https://push.example.com/sub/fake',
      p256dh: 'fake-p256dh',
      auth: 'fake-auth',
    });

    // Notification that has already failed 4 times
    const pastTime = new Date(Date.now() - 60 * 1000);
    const notif = await Notification.create({
      schoolId: school._id,
      userId: user._id,
      type: 'approval_request',
      payload: { title: 'Test', body: 'Retry me' },
      status: 'failed',
      attempts: 4,
      nextAttemptAt: pastTime,
      dedupeKey: 'test:retry:giveup',
    });

    const result = await processNotificationOutbox();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const updated = await Notification.findById(notif._id);
    expect(updated?.attempts).toBe(5);
    expect(updated?.status).toBe('failed');
    expect(result.exhausted).toBe(1);
  });

  it('A4: no-subscription falls back to school principals immediately', async () => {
    const school = await School.create({
      schoolId: 'TEST-SCH-04',
      name: 'Delhi Model School 4',
      udiseCode: '07010100104',
      district: 'Central',
      state: 'Delhi',
    });

    const teacher = await User.create({
      name: 'No Sub Teacher',
      phone: '9844444441',
      passwordHash: 'dummy',
      role: 'teacher',
      schoolIds: [school._id],
      isActive: true,
    });

    const principal = await User.create({
      name: 'Principal Four',
      phone: '9844444442',
      passwordHash: 'dummy',
      role: 'principal',
      schoolIds: [school._id],
      isActive: true,
    });

    // Teacher has ZERO subscriptions
    const results = await notify(
      teacher._id,
      'approval_request',
      { title: 'Visitor Alert', body: 'Student pickup' },
      'test:dedupe:nosub:1',
      {
        schoolId: school._id,
        fallbackToPrincipalsIfNoSub: true,
      }
    );

    expect(results.length).toBe(1);
    expect(results[0]?.status).toBe('no_subscription');

    // Principal should have received the fallback notification in the outbox
    const principalNotifs = await Notification.find({
      userId: principal._id,
      dedupeKey: { $regex: /nosub_fallback/ },
    });
    expect(principalNotifs.length).toBe(1);
    expect(principalNotifs[0]?.type).toBe('approval_request');
  });

  it('A5: expiry sets status and writes audit log', async () => {
    const school = await School.create({
      schoolId: 'TEST-SCH-05',
      name: 'Delhi Model School 5',
      udiseCode: '07010100105',
      district: 'Central',
      state: 'Delhi',
      teacherApprovalExpiryMinutes: 30,
    });

    const guard = await User.create({
      name: 'Guard Five',
      phone: '9855555555',
      passwordHash: 'dummy',
      role: 'guard',
      schoolIds: [school._id],
      isActive: true,
    });

    const student = await Student.create({
      schoolId: school._id,
      admissionNo: 'ADM-1005',
      name: 'Karan Mehra',
      className: '7',
      section: 'A',
      isActive: true,
    });

    const visitor = await Visitor.create({
      schoolId: school._id,
      phone: '9855555556',
      name: 'Mohan Mehra',
    });

    const visit = await Visit.create({
      schoolId: school._id,
      clientId: 'client-visit-5',
      visitorId: visitor._id,
      studentIds: [student._id],
      purpose: 'Pickup',
      isApproved: false,
      pickupBlocked: true,
      entryAt: new Date(),
      checkedInBy: guard._id,
    });

    // Created 35 minutes ago -> older than 30 min limit
    const thirtyFiveMinsAgo = new Date(Date.now() - 35 * 60 * 1000);
    const req = await ApprovalRequest.create({
      schoolId: school._id,
      visitId: visit._id,
      studentId: student._id,
      visitorId: visitor._id,
      status: 'pending',
      requestedBy: guard._id,
      createdAt: thirtyFiveMinsAgo,
    });

    const expiredCount = await checkAndExpireStaleRequests(school._id);
    expect(expiredCount).toBe(1);

    const reloaded = await ApprovalRequest.findById(req._id);
    expect(reloaded?.status).toBe('expired');

    const logs = await AuditLog.find({
      entityId: req._id,
      action: 'approval.expire',
    });
    expect(logs.length).toBe(1);
    expect(logs[0]?.metadata?.expiredAfterMinutes).toBe(30);
  });
});
