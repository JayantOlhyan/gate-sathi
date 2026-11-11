import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppHeader } from '@/components/app-header';
import { connectDB } from '@/lib/db';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { School } from '@/models/School';
import { StudentsClient } from './students-client';

export default async function StudentsPage() {
  let activeSchoolId = '';
  let schoolName = 'GateSathi School';
  let udiseCode = '';
  let district = '';
  let state = '';

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
      await connectDB();
      const schoolDoc = await School.findById(activeSchoolId)
        .select('name udiseCode district state')
        .lean();
      if (schoolDoc) {
        schoolName = schoolDoc.name;
        udiseCode = schoolDoc.udiseCode;
        district = schoolDoc.district ?? '';
        state = schoolDoc.state ?? '';
      }
    }
  } catch (error) {
    if (error instanceof RbacError && error.status === 401) {
      redirect('/login');
    }
    redirect('/gate');
  }

  const tApp = await getTranslations('app');
  const subtitle = udiseCode
    ? `${schoolName} · UDISE ${udiseCode}`
    : schoolName;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <div className="lg:hidden">
        <AppHeader showLogout subtitle={subtitle} />
      </div>
      <StudentsClient
        schoolId={activeSchoolId}
        schoolName={schoolName}
        udiseCode={udiseCode}
        district={district}
        state={state}
        logoutLabel={tApp('logout')}
      />
    </div>
  );
}
