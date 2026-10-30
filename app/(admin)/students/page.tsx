import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { connectDB } from '@/lib/db';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { School } from '@/models/School';
import { StudentsClient } from './students-client';

export default async function StudentsPage() {
  let activeSchoolId = '';

  try {
    const user = await requireRole('principal', 'super_admin');
    let targetSchoolId = user.schoolIds[0];

    if (!targetSchoolId && user.role === 'super_admin') {
      if (process.env.MONGODB_URI) {
        await connectDB();
        const firstSchool = await School.findOne({ isActive: true })
          .select('_id')
          .lean();
        if (firstSchool?._id) {
          targetSchoolId = String(firstSchool._id);
        }
      } else {
        targetSchoolId = '6ae4b61d181c9c0a1f841a3e';
      }
    }

    if (targetSchoolId) {
      const access = await requireSchoolAccess(targetSchoolId);
      activeSchoolId = access.schoolId;
    }
  } catch (error) {
    if (error instanceof RbacError && error.status === 401) {
      redirect('/login');
    }
    redirect('/gate');
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader showLogout />
      <main className="flex-1 p-4">
        <StudentsClient schoolId={activeSchoolId} />
      </main>
    </div>
  );
}
