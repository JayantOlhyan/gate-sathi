import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppHeader } from '@/components/app-header';
import { InstallPrompt } from '@/components/install-prompt';
import { connectDB } from '@/lib/db';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { School } from '@/models/School';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  let user;
  let activeSchoolId = '';
  let schoolName = 'GateSathi School';
  let udiseCode = '';
  let district = '';
  let state = '';

  try {
    user = await requireRole('principal', 'super_admin');
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
      {/* Mobile Header (<1024px) */}
      <div className="lg:hidden">
        <AppHeader showLogout subtitle={subtitle} />
      </div>
      <div className="lg:hidden px-3.5 pt-2">
        <InstallPrompt variant="compact" />
      </div>
      <Suspense fallback={null}>
        <DashboardClient
          schoolId={activeSchoolId}
          schoolName={schoolName}
          udiseCode={udiseCode}
          district={district}
          state={state}
          logoutLabel={tApp('logout')}
        />
      </Suspense>
    </div>
  );
}
