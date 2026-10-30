import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { connectDB } from '@/lib/db';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { School } from '@/models/School';
import { InsideClient } from './inside-client';

export default async function InsidePage() {
  let activeSchoolId = '';

  try {
    const user = await requireRole('guard', 'principal', 'super_admin');
    let primarySchoolId = user.schoolIds[0];

    if (!primarySchoolId && user.role === 'super_admin') {
      await connectDB();
      const firstSchool = await School.findOne({ isActive: true })
        .select('_id')
        .lean();
      if (firstSchool?._id) {
        primarySchoolId = String(firstSchool._id);
      }
    }

    if (primarySchoolId) {
      const access = await requireSchoolAccess(primarySchoolId);
      activeSchoolId = access.schoolId;
    }
  } catch (error) {
    if (error instanceof RbacError && error.status === 401) {
      redirect('/login');
    }
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader showLogout />
      <main className="flex-1 p-4">
        <InsideClient schoolId={activeSchoolId} />
      </main>
    </div>
  );
}
