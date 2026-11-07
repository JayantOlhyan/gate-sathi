import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import 'fake-indexeddb/auto';
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
import { Notification } from '@/models/Notification';
import { AuditLog } from '@/models/AuditLog';
import { POST as createVisitRoute } from '@/app/api/gate/visits/route';
import {
  enqueueOfflineVisit,
  getOfflineVisits,
  getOfflineVisitsCount,
  getFailedVisits,
  getFailedVisitsCount,
  retryFailedVisit,
  dismissFailedVisit,
  moveVisitToFailed,
  syncOfflineVisits,
  openOfflineDB,
  type OfflineVisitRecord,
} from '@/lib/offline-queue';

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

  // Clear fake-indexeddb
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(['pending_visits', 'failed_visits'], 'readwrite');
    tx.objectStore('pending_visits').clear();
    tx.objectStore('failed_visits').clear();
  } catch {
    // ignore
  }

  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Offline Queue & Gate Entry Suite (Bugs 1–3)', () => {
  describe('Bug 1 (SAFETY): Unapproved Pickup Offline Guarding & Blocked Sync', () => {
    it('when unapproved pickup is synced after being logged as blocked, server sets pickupBlocked=true and creates pending ApprovalRequest', async () => {
      const school = await School.create({
        schoolId: 'SCH-OFF-01',
        name: 'Govt Boys Sr Sec School',
        udiseCode: '07010100201',
        district: 'North',
        state: 'Delhi',
      });

      const guard = await User.create({
        name: 'Guard Ram',
        phone: '9811112221',
        passwordHash: 'dummy',
        role: 'guard',
        schoolIds: [school._id],
        isActive: true,
      });

      const teacher = await User.create({
        name: 'Teacher Geeta',
        phone: '9811112222',
        passwordHash: 'dummy',
        role: 'teacher',
        schoolIds: [school._id],
        classAssignments: [{ schoolId: school._id, className: '5', section: 'A' }],
        isActive: true,
      });

      const student = await Student.create({
        schoolId: school._id,
        admissionNo: 'ADM-901',
        name: 'Aakash Verma',
        className: '5',
        section: 'A',
        isActive: true,
      });

      mockAuth.mockResolvedValue({
        user: {
          id: String(guard._id),
          role: 'guard',
          schoolIds: [String(school._id)],
        },
      });

      const reqBody = JSON.stringify({
        schoolId: String(school._id),
        clientId: 'client-offline-safety-1',
        phone: '9811112223',
        name: 'Stranger Uncle',
        studentIds: [String(student._id)],
        purpose: 'Pickup',
        reasonCode: 'Relative',
        entryAt: new Date().toISOString(),
      });

      const res = await createVisitRoute(
        new NextRequest('http://localhost/api/gate/visits', {
          method: 'POST',
          body: reqBody,
        })
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.visit.pickupBlocked).toBe(true);
      expect(data.approvalRequests.length).toBe(1);
      expect(data.approvalRequests[0].status).toBe('pending');

      const dbVisit = await Visit.findById(data.visit._id);
      expect(dbVisit?.pickupBlocked).toBe(true);

      const dbReq = await ApprovalRequest.findOne({ visitId: data.visit._id });
      expect(dbReq?.status).toBe('pending');
      expect(String(dbReq?.teacherId)).toBe(String(teacher._id));
    });
  });

  describe('Bug 2 (TIMESTAMPS): entryAt validation & offlineSynced audit metadata', () => {
    it('accepts valid offline entryAt (within past 24h) and records offlineSynced=true in audit log', async () => {
      const school = await School.create({
        schoolId: 'SCH-OFF-02',
        name: 'Govt Girls Sr Sec School',
        udiseCode: '07010100202',
        district: 'South',
        state: 'Delhi',
      });

      const guard = await User.create({
        name: 'Guard Shyam',
        phone: '9811112224',
        passwordHash: 'dummy',
        role: 'guard',
        schoolIds: [school._id],
        isActive: true,
      });

      const student = await Student.create({
        schoolId: school._id,
        admissionNo: 'ADM-902',
        name: 'Neha Kumari',
        className: '6',
        section: 'B',
        isActive: true,
      });

      mockAuth.mockResolvedValue({
        user: {
          id: String(guard._id),
          role: 'guard',
          schoolIds: [String(school._id)],
        },
      });

      // Captured 15 minutes ago
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const reqBody = JSON.stringify({
        schoolId: String(school._id),
        clientId: 'client-offline-ts-1',
        phone: '9811112225',
        name: 'Sunil Kumari',
        studentIds: [String(student._id)],
        purpose: 'Office work',
        reasonCode: 'Other',
        reasonText: 'Fee inquiry',
        entryAt: fifteenMinsAgo.toISOString(),
      });

      const res = await createVisitRoute(
        new NextRequest('http://localhost/api/gate/visits', {
          method: 'POST',
          body: reqBody,
        })
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(new Date(data.visit.entryAt).getTime()).toBeCloseTo(fifteenMinsAgo.getTime(), -3);

      const logs = await AuditLog.find({ entityId: data.visit._id, action: 'visit.create' });
      expect(logs.length).toBe(1);
      expect(logs[0]?.metadata?.offlineSynced).toBe(true);
    });

    it('ignores entryAt older than 24h and falls back to server time without offlineSynced flag', async () => {
      const school = await School.create({
        schoolId: 'SCH-OFF-03',
        name: 'Delhi Public School',
        udiseCode: '07010100203',
        district: 'East',
        state: 'Delhi',
      });

      const guard = await User.create({
        name: 'Guard Mohan',
        phone: '9811112226',
        passwordHash: 'dummy',
        role: 'guard',
        schoolIds: [school._id],
        isActive: true,
      });

      const student = await Student.create({
        schoolId: school._id,
        admissionNo: 'ADM-903',
        name: 'Rohan Lal',
        className: '8',
        section: 'C',
        isActive: true,
      });

      mockAuth.mockResolvedValue({
        user: {
          id: String(guard._id),
          role: 'guard',
          schoolIds: [String(school._id)],
        },
      });

      // 30 hours ago (> 24h limit)
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const reqBody = JSON.stringify({
        schoolId: String(school._id),
        clientId: 'client-offline-ts-2',
        phone: '9811112227',
        name: 'Rohan Father',
        studentIds: [String(student._id)],
        purpose: 'Office work',
        reasonCode: 'Other',
        reasonText: 'TC application',
        entryAt: thirtyHoursAgo.toISOString(),
      });

      const beforeCallMs = Date.now();
      const res = await createVisitRoute(
        new NextRequest('http://localhost/api/gate/visits', {
          method: 'POST',
          body: reqBody,
        })
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(new Date(data.visit.entryAt).getTime()).toBeGreaterThanOrEqual(beforeCallMs - 500);

      const logs = await AuditLog.find({ entityId: data.visit._id, action: 'visit.create' });
      expect(logs.length).toBe(1);
      expect(logs[0]?.metadata?.offlineSynced).toBeUndefined();
    });
  });

  describe('Bug 3 (NO SILENT LOSS): Error retention, 401 handling, and photo requirement', () => {
    it('moves rejected entry (400) to failed store with error message, allows retry and dismiss', async () => {
      const record: OfflineVisitRecord = {
        clientId: 'failed-entry-1',
        schoolId: 'SCH-01',
        payload: {
          schoolId: 'SCH-01',
          clientId: 'failed-entry-1',
          phone: '9812345678',
          name: 'Invalid Student Entry',
          studentIds: ['507f1f77bcf86cd799439011'],
          purpose: 'Office work',
        },
        createdAt: Date.now(),
      };

      await enqueueOfflineVisit(record);
      expect(await getOfflineVisitsCount()).toBe(1);

      // Mock server returning 400 validation error
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'one or more students do not belong to this school' }),
      });
      globalThis.fetch = mockFetch as any;

      const syncResult = await syncOfflineVisits();
      expect(syncResult.synced).toBe(0);
      expect(await getOfflineVisitsCount()).toBe(0); // removed from pending
      expect(await getFailedVisitsCount()).toBe(1); // moved to failed store

      const failedList = await getFailedVisits();
      expect(failedList.length).toBe(1);
      expect(failedList[0]?.clientId).toBe('failed-entry-1');
      expect(failedList[0]?.error).toContain('one or more students do not belong to this school');

      // Test retry: moves back to pending
      await retryFailedVisit('failed-entry-1');
      expect(await getFailedVisitsCount()).toBe(0);
      expect(await getOfflineVisitsCount()).toBe(1);

      // Move to failed again and test dismiss
      await moveVisitToFailed(record, 'Some error', 400);
      expect(await getFailedVisitsCount()).toBe(1);
      await dismissFailedVisit('failed-entry-1');
      expect(await getFailedVisitsCount()).toBe(0);
    });

    it('retains entry in pending queue when server returns 401 (session expired)', async () => {
      const record: OfflineVisitRecord = {
        clientId: 'expired-entry-1',
        schoolId: 'SCH-01',
        payload: {
          schoolId: 'SCH-01',
          clientId: 'expired-entry-1',
          phone: '9812345678',
          name: 'Expired Session Entry',
          studentIds: ['507f1f77bcf86cd799439011'],
          purpose: 'Office work',
        },
        createdAt: Date.now(),
      };

      await enqueueOfflineVisit(record);
      expect(await getOfflineVisitsCount()).toBe(1);

      // Mock server returning 401
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized: session expired' }),
      });
      globalThis.fetch = mockFetch as any;

      const syncResult = await syncOfflineVisits();
      expect(syncResult.sessionExpired).toBe(true);
      expect(syncResult.synced).toBe(0);
      // Still in pending queue, NOT dropped and NOT moved to failed
      expect(await getOfflineVisitsCount()).toBe(1);
      expect(await getFailedVisitsCount()).toBe(0);
    });

    it('does NOT send visit without photo when photo upload fails during sync; keeps in queue', async () => {
      const photoBlob = new Blob(['fake image content'], { type: 'image/jpeg' });
      const record: OfflineVisitRecord = {
        clientId: 'photo-entry-1',
        schoolId: 'SCH-01',
        payload: {
          schoolId: 'SCH-01',
          clientId: 'photo-entry-1',
          phone: '9812345678',
          name: 'Photo Required Entry',
          studentIds: ['507f1f77bcf86cd799439011'],
          purpose: 'Office work',
        },
        photoBlob,
        createdAt: Date.now(),
      };

      await enqueueOfflineVisit(record);
      expect(await getOfflineVisitsCount()).toBe(1);

      // Mock fetch: /api/uploads/sign fails with 500
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/uploads/sign')) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ visit: {} }) });
      });
      globalThis.fetch = mockFetch as any;

      const syncResult = await syncOfflineVisits();
      expect(syncResult.synced).toBe(0);
      // Entry remains in queue with photoBlob intact
      expect(await getOfflineVisitsCount()).toBe(1);
      const pending = await getOfflineVisits();
      expect(pending[0]?.photoBlob).toBeDefined();

      // Ensure /api/gate/visits was NEVER called without the photo
      const visitsCalls = mockFetch.mock.calls.filter((c: any[]) => c[0] === '/api/gate/visits');
      expect(visitsCalls.length).toBe(0);
    });

    it('FIX 1: when sign endpoint returns 503 storage not configured, submits visit with photoMissing=true and removes from queue; when fetch throws, stays queued', async () => {
      const school = await School.create({
        schoolId: 'SCH-FIX1',
        name: 'Govt Co-ed SSS',
        udiseCode: '07010100301',
        district: 'North',
        state: 'Delhi',
      });

      const guard = await User.create({
        name: 'Guard Fix1',
        phone: '9811113331',
        passwordHash: 'dummy',
        role: 'guard',
        schoolIds: [school._id],
        isActive: true,
      });

      const student = await Student.create({
        schoolId: school._id,
        admissionNo: 'ADM-FIX1',
        name: 'Riya Sharma',
        className: '4',
        section: 'A',
        isActive: true,
      });

      mockAuth.mockResolvedValue({
        user: {
          id: String(guard._id),
          role: 'guard',
          schoolIds: [String(school._id)],
        },
      });

      const photoBlob = new Blob(['offline photo bytes'], { type: 'image/jpeg' });
      const record: OfflineVisitRecord = {
        clientId: 'fix1-photo-entry',
        schoolId: String(school._id),
        payload: {
          schoolId: String(school._id),
          clientId: 'fix1-photo-entry',
          phone: '9811113339',
          name: 'Visitor Without R2',
          studentIds: [String(student._id)],
          purpose: 'Office work',
          reasonCode: 'Relative',
          entryAt: new Date().toISOString(),
        },
        photoBlob,
        createdAt: Date.now(),
      };

      await enqueueOfflineVisit(record);
      expect(await getOfflineVisitsCount()).toBe(1);

      // Part A: when fetch throws (network error), the visit stays queued
      const throwingFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      globalThis.fetch = throwingFetch as any;

      const netFailResult = await syncOfflineVisits();
      expect(netFailResult.synced).toBe(0);
      expect(await getOfflineVisitsCount()).toBe(1);
      expect((await getOfflineVisits())[0]?.photoBlob).toBeTruthy();

      // Part B: when /api/uploads/sign returns 503 storage not configured,
      // drops photoBlob, submits to /api/gate/visits with photoMissing=true, and removes from queue
      const r2UnsetFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/uploads/sign')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: 'Photo storage is not configured' }),
          };
        }
        if (url.includes('/api/gate/visits')) {
          const routeRes = await createVisitRoute(
            new NextRequest('http://localhost/api/gate/visits', {
              method: 'POST',
              body: init?.body as string,
            })
          );
          const data = await routeRes.json();
          return {
            ok: routeRes.ok,
            status: routeRes.status,
            json: async () => data,
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });
      globalThis.fetch = r2UnsetFetch as any;

      const syncOkResult = await syncOfflineVisits();
      expect(syncOkResult.synced).toBe(1);
      expect(syncOkResult.remaining).toBe(0);
      expect(await getOfflineVisitsCount()).toBe(0);

      const savedVisit = await Visit.findOne({ clientId: 'fix1-photo-entry' }).lean();
      expect(savedVisit).not.toBeNull();
      expect(savedVisit?.photoMissing).toBe(true);
    });
  });

  describe('FIX 2: Stale offline-synced pickup requests expire on sync without notifying teacher', () => {
    it('creates ApprovalRequest with status expired, zero Notification docs, and writes approval.expired_on_sync audit log when entryAt is older than expiry window; younger creates pending + notification', async () => {
      const school = await School.create({
        schoolId: 'SCH-FIX2',
        name: 'Govt Sarvodaya Vidyalaya',
        udiseCode: '07010100302',
        district: 'West',
        state: 'Delhi',
        teacherApprovalExpiryMinutes: 30,
      });

      const guard = await User.create({
        name: 'Guard Fix2',
        phone: '9811114441',
        passwordHash: 'dummy',
        role: 'guard',
        schoolIds: [school._id],
        isActive: true,
      });

      const teacher = await User.create({
        name: 'Teacher Fix2',
        phone: '9811114442',
        passwordHash: 'dummy',
        role: 'teacher',
        schoolIds: [school._id],
        classAssignments: [{ schoolId: school._id, className: '5', section: 'A' }],
        isActive: true,
      });

      const student = await Student.create({
        schoolId: school._id,
        admissionNo: 'ADM-FIX2',
        name: 'Kabir Singh',
        className: '5',
        section: 'A',
        isActive: true,
      });

      mockAuth.mockResolvedValue({
        user: {
          id: String(guard._id),
          role: 'guard',
          schoolIds: [String(school._id)],
        },
      });

      // 1. Older than expiry window (e.g. 2 hours ago > 30m)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const staleRes = await createVisitRoute(
        new NextRequest('http://localhost/api/gate/visits', {
          method: 'POST',
          body: JSON.stringify({
            schoolId: String(school._id),
            clientId: 'fix2-stale-pickup',
            phone: '9811114445',
            name: 'Late Synced Relative',
            studentIds: [String(student._id)],
            purpose: 'Pickup',
            reasonCode: 'Relative',
            entryAt: twoHoursAgo.toISOString(),
          }),
        })
      );

      expect(staleRes.status).toBe(201);
      const staleData = await staleRes.json();
      expect(staleData.visit.pickupBlocked).toBe(true);
      expect(staleData.visit.isApproved).toBe(false);
      expect(staleData.approvalRequests).toHaveLength(1);
      expect(staleData.approvalRequests[0].status).toBe('expired');

      // Zero Notification docs created for stale sync
      const notifCountAfterStale = await Notification.countDocuments({
        schoolId: school._id,
      });
      expect(notifCountAfterStale).toBe(0);

      // Audit log approval.expired_on_sync written
      const expiredAudit = await AuditLog.findOne({
        schoolId: school._id,
        action: 'approval.expired_on_sync',
        entityId: staleData.approvalRequests[0]._id,
      }).lean();
      expect(expiredAudit).not.toBeNull();

      // 2. Younger than expiry window (e.g. 10 minutes ago <= 30m)
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const freshRes = await createVisitRoute(
        new NextRequest('http://localhost/api/gate/visits', {
          method: 'POST',
          body: JSON.stringify({
            schoolId: String(school._id),
            clientId: 'fix2-fresh-pickup',
            phone: '9811114446',
            name: 'Fresh Synced Relative',
            studentIds: [String(student._id)],
            purpose: 'Pickup',
            reasonCode: 'Relative',
            entryAt: tenMinsAgo.toISOString(),
          }),
        })
      );

      expect(freshRes.status).toBe(201);
      const freshData = await freshRes.json();
      expect(freshData.visit.pickupBlocked).toBe(true);
      expect(freshData.approvalRequests).toHaveLength(1);
      expect(freshData.approvalRequests[0].status).toBe('pending');

      // Notification doc created for teacher
      const notifsAfterFresh = await Notification.find({
        schoolId: school._id,
        userId: teacher._id,
      }).lean();
      expect(notifsAfterFresh.length).toBe(1);
    });
  });
});
