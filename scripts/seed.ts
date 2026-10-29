import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { School, User, Student } from '@/models';
import { loginSchema } from '@/lib/validations';

const seedEnvSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required to run seed'),
});

const DUMMY_STUDENTS = [
  { name: 'Aarav Kumar', className: '5', section: 'A', rollNumber: '101', guardianPhone: '9810000001' },
  { name: 'Priya Sharma', className: '5', section: 'A', rollNumber: '102', guardianPhone: '9810000002' },
  { name: 'Rohan Verma', className: '6', section: 'A', rollNumber: '201', guardianPhone: '9810000003' },
  { name: 'Ananya Singh', className: '6', section: 'B', rollNumber: '202', guardianPhone: '9810000004' },
  { name: 'Kabir Yadav', className: '7', section: 'A', rollNumber: '301', guardianPhone: '9810000005' },
  { name: 'Meera Devi', className: '7', section: 'B', rollNumber: '302', guardianPhone: '9810000006' },
  { name: 'Aditya Patel', className: '8', section: 'A', rollNumber: '401', guardianPhone: '9810000007' },
  { name: 'Kavya Gupta', className: '8', section: 'A', rollNumber: '402', guardianPhone: '9810000008' },
  { name: 'Vikram Joshi', className: '9', section: 'A', rollNumber: '501', guardianPhone: '9810000009' },
  { name: 'Sunita Chauhan', className: '10', section: 'A', rollNumber: '601', guardianPhone: '9810000010' },
];

export async function runSeed() {
  seedEnvSchema.parse({ MONGODB_URI: process.env.MONGODB_URI });
  await connectDB();

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
          failedLoginAttempts: 0,
          lockUntil: null,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }

  for (const s of DUMMY_STUDENTS) {
    await Student.findOneAndUpdate(
      {
        schoolId: pilotSchool._id,
        className: s.className,
        section: s.section,
        rollNumber: s.rollNumber,
      },
      {
        $set: {
          schoolId: pilotSchool._id,
          name: s.name,
          className: s.className,
          section: s.section,
          rollNumber: s.rollNumber,
          guardianPhone: s.guardianPhone,
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
