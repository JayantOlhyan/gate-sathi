import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { School, User, Student } from '@/models';
import { loginSchema, studentInputSchema } from '@/lib/validations';

const seedEnvSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required to run seed'),
});

export function assertNotProduction(nodeEnv: string | undefined = process.env.NODE_ENV) {
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seed script when NODE_ENV=production');
  }
}

const DUMMY_STUDENTS = [
  { admissionNo: 'ADM-2026-001', name: 'Aarav Kumar', className: '5', section: 'A', rollNumber: '101', guardianPhone: '9810000001' },
  { admissionNo: 'ADM-2026-002', name: 'Priya Sharma', className: '5', section: 'A', rollNumber: '102', guardianPhone: '9810000002' },
  { admissionNo: 'ADM-2026-003', name: 'Rohan Verma', className: '6', section: 'A', rollNumber: '201', guardianPhone: '9810000003' },
  { admissionNo: 'ADM-2026-004', name: 'Ananya Singh', className: '6', section: 'B', rollNumber: '202', guardianPhone: '9810000004' },
  { admissionNo: 'ADM-2026-005', name: 'Kabir Yadav', className: '7', section: 'A', rollNumber: '301', guardianPhone: '9810000005' },
  { admissionNo: 'ADM-2026-006', name: 'Meera Devi', className: '7', section: 'B', rollNumber: '302', guardianPhone: '9810000006' },
  { admissionNo: 'ADM-2026-007', name: 'Aditya Patel', className: '8', section: 'A', rollNumber: '401', guardianPhone: '9810000007' },
  { admissionNo: 'ADM-2026-008', name: 'Kavya Gupta', className: '8', section: 'A', rollNumber: '402', guardianPhone: '9810000008' },
  { admissionNo: 'ADM-2026-009', name: 'Vikram Joshi', className: '9', section: 'A', rollNumber: '501', guardianPhone: '9810000009' },
  { admissionNo: 'ADM-2026-010', name: 'Sunita Chauhan', className: '10', section: 'A', rollNumber: '601', guardianPhone: '9810000010' },
];

export async function runSeed() {
  assertNotProduction(process.env.NODE_ENV);
  seedEnvSchema.parse({ MONGODB_URI: process.env.MONGODB_URI });
  await connectDB();

  // Drop legacy index if it exists from earlier dev runs
  try {
    await Student.collection.dropIndex('schoolId_1_className_1_section_1_rollNumber_1');
  } catch {
    // Index may not exist; safe to ignore
  }

  const pilotSchool = await School.findOneAndUpdate(
    { udiseCode: '09150100101' },
    {
      $set: {
        schoolId: 'PILOT-SCHOOL-001',
        name: 'Pilot School',
        udiseCode: '09150100101',
        district: 'Lucknow',
        state: 'Uttar Pradesh',
        address: 'Block Chinhat, Government Senior Secondary Campus',
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );

  const seedUsers = [
    {
      name: 'State Super Admin',
      phone: '9999999990',
      password: 'Password@123',
      role: 'super_admin' as const,
      schoolIds: [],
    },
    {
      name: 'Rajeshwari Mishra (Principal)',
      phone: '9999999991',
      password: 'Password@123',
      role: 'principal' as const,
      schoolIds: [pilotSchool._id],
    },
    {
      name: 'Ramesh Tiwari (Guard)',
      phone: '9999999992',
      password: 'Password@123',
      role: 'guard' as const,
      schoolIds: [pilotSchool._id],
    },
  ];

  for (const u of seedUsers) {
    loginSchema.parse({ phone: u.phone, password: u.password });
    const passwordHash = await bcrypt.hash(u.password, 10);

    await User.findOneAndUpdate(
      { phone: u.phone },
      {
        $set: {
          name: u.name,
          phone: u.phone,
          passwordHash,
          role: u.role,
          schoolIds: u.schoolIds,
          tokenVersion: 0,
          isActive: true,
        },
        $unset: {
          failedLoginAttempts: 1,
          lockUntil: 1,
        },
      },
      { upsert: true, new: true }
    );
  }

  for (const s of DUMMY_STUDENTS) {
    const validatedStudent = studentInputSchema.parse({
      ...s,
      schoolId: String(pilotSchool._id),
    });

    await Student.findOneAndUpdate(
      {
        schoolId: pilotSchool._id,
        admissionNo: validatedStudent.admissionNo,
      },
      {
        $set: {
          schoolId: pilotSchool._id,
          admissionNo: validatedStudent.admissionNo,
          name: validatedStudent.name,
          className: validatedStudent.className,
          section: validatedStudent.section,
          rollNumber: validatedStudent.rollNumber,
          guardianPhone: validatedStudent.guardianPhone,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }

  console.log('Seed completed successfully:');
  console.log(`- School: ${pilotSchool.name} (_id: ${String(pilotSchool._id)})`);
  console.log('- Super Admin: 9999999990 / Password@123');
  console.log('- Principal:   9999999991 / Password@123');
  console.log('- Guard:       9999999992 / Password@123');
  console.log(`- Students:    ${DUMMY_STUDENTS.length} dummy students upserted`);
}

if (require.main === module) {
  runSeed()
    .then(() => mongoose.disconnect())
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
