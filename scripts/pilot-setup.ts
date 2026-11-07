/**
 * Pilot onboarding CLI — run from your laptop against the pilot database.
 *
 *   MONGODB_URI="mongodb+srv://..." npm run pilot -- <command> [--flags]
 *
 * Commands:
 *   school         --udise 07xxxxxxxxx --name "GBSSS ..." --district "South West" [--state Delhi]
 *                  [--address "..."] [--closing 14:00]
 *   user           --role principal|guard|teacher --udise <school udise> --name "..." --phone 98xxxxxxxx
 *                  [--password "..."]   (omit to auto-generate; printed once)
 *                  teacher only: --class 5 --section A
 *   set-password   --phone 98xxxxxxxx [--password "..."]   (also signs the user out everywhere)
 *   disable-demo   deactivates the demo logins 9999999990-9999999993 published on the marketing page
 *   list           --udise <school udise>   (shows users of that school)
 */
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { indianPhoneSchema } from '@/lib/validations';
import { School, User } from '@/models';

const DEMO_PHONES = ['9999999990', '9999999991', '9999999992', '9999999993'];

function generatePassword(): string {
  // 10 chars, no ambiguous characters (0/O, 1/l/I) — easy to read out to a guard.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function need(value: string | undefined, flag: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required flag --${flag}`);
  }
  return value.trim();
}

async function findSchool(udise: string) {
  const school = await School.findOne({ udiseCode: udise });
  if (!school) {
    throw new Error(`No school with UDISE ${udise}. Run the "school" command first.`);
  }
  return school;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values: f } = parseArgs({
    args: rest,
    options: {
      udise: { type: 'string' },
      name: { type: 'string' },
      district: { type: 'string' },
      state: { type: 'string' },
      address: { type: 'string' },
      closing: { type: 'string' },
      role: { type: 'string' },
      phone: { type: 'string' },
      password: { type: 'string' },
      class: { type: 'string' },
      section: { type: 'string' },
    },
  });

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }
  await connectDB();

  switch (command) {
    case 'school': {
      const udise = need(f.udise, 'udise');
      const school = await School.findOneAndUpdate(
        { udiseCode: udise },
        {
          $set: {
            name: need(f.name, 'name'),
            district: need(f.district, 'district'),
            state: f.state?.trim() || 'Delhi',
            ...(f.address ? { address: f.address.trim() } : {}),
            ...(f.closing ? { closingHourIst: f.closing.trim() } : {}),
            isActive: true,
          },
          $setOnInsert: { schoolId: `SCH-${udise}`, udiseCode: udise },
        },
        { upsert: true, new: true }
      );
      console.log(
        `School ready: ${school.name} (UDISE ${school.udiseCode}, _id ${String(school._id)})`
      );
      break;
    }

    case 'user': {
      const role = need(f.role, 'role');
      if (!['principal', 'guard', 'teacher'].includes(role)) {
        throw new Error('--role must be principal, guard or teacher');
      }
      const school = await findSchool(need(f.udise, 'udise'));
      const phone = indianPhoneSchema.parse(need(f.phone, 'phone'));
      const password = f.password?.trim() || generatePassword();
      if (password.length < 6) throw new Error('Password must be at least 6 characters');

      const classAssignments =
        role === 'teacher'
          ? [
              {
                schoolId: school._id,
                className: need(f.class, 'class'),
                section: need(f.section, 'section'),
              },
            ]
          : [];

      const existing = await User.findOne({ phone });
      if (existing && existing.role !== role) {
        throw new Error(
          `Phone ${phone} already belongs to a ${existing.role}. Use a different number.`
        );
      }

      await User.findOneAndUpdate(
        { phone },
        {
          $set: {
            name: need(f.name, 'name'),
            phone,
            role,
            passwordHash: await bcrypt.hash(password, 10),
            schoolIds: [school._id],
            classAssignments,
            isActive: true,
          },
          $inc: { tokenVersion: 1 },
          $unset: { failedLoginAttempts: 1, lockUntil: 1 },
        },
        { upsert: true, new: true }
      );
      console.log(`${role} ${f.name} → login ${phone} / ${password}`);
      console.log('Write this password down now; it is not stored anywhere in plain text.');
      break;
    }

    case 'set-password': {
      const phone = indianPhoneSchema.parse(need(f.phone, 'phone'));
      const password = f.password?.trim() || generatePassword();
      if (password.length < 6) throw new Error('Password must be at least 6 characters');
      const res = await User.updateOne(
        { phone },
        {
          $set: { passwordHash: await bcrypt.hash(password, 10) },
          $inc: { tokenVersion: 1 },
          $unset: { failedLoginAttempts: 1, lockUntil: 1 },
        }
      );
      if (res.matchedCount === 0) throw new Error(`No user with phone ${phone}`);
      console.log(`Password reset → login ${phone} / ${password} (existing sessions signed out)`);
      break;
    }

    case 'disable-demo': {
      const res = await User.updateMany(
        { phone: { $in: DEMO_PHONES } },
        { $set: { isActive: false }, $inc: { tokenVersion: 1 } }
      );
      console.log(`Demo logins disabled: ${res.modifiedCount} of ${DEMO_PHONES.length}`);
      break;
    }

    case 'list': {
      const school = await findSchool(need(f.udise, 'udise'));
      const users = await User.find({ schoolIds: school._id })
        .select('name phone role isActive classAssignments')
        .lean();
      console.log(`${school.name} (${school.udiseCode})`);
      for (const u of users) {
        const cls = (u.classAssignments ?? []).map((c) => `${c.className}-${c.section}`).join(', ');
        console.log(
          `  ${u.role.padEnd(9)} ${u.phone}  ${u.name}${cls ? `  [${cls}]` : ''}${u.isActive ? '' : '  (inactive)'}`
        );
      }
      break;
    }

    default:
      throw new Error(
        'Usage: npm run pilot -- <school|user|set-password|disable-demo|list> [flags]. See header of scripts/pilot-setup.ts.'
      );
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('pilot-setup failed:', err instanceof Error ? err.message : err);
    await mongoose.disconnect();
    process.exit(1);
  });
