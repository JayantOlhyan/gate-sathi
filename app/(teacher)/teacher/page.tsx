import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { InstallPrompt } from '@/components/install-prompt';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { TeacherClient } from './teacher-client';

export default async function TeacherPage() {
  let user;
  let activeSchoolId = '';

  try {
    user = await requireRole('teacher', 'principal', 'super_admin');
    const primarySchoolId = user.schoolIds?.[0];
    if (primarySchoolId) {
      const access = await requireSchoolAccess(primarySchoolId);
      activeSchoolId = access.schoolId;
    }
  } catch (error) {
    if (error instanceof RbacError && error.status === 401) {
      redirect('/login');
    }
    redirect('/app');
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader showLogout />
      <main className="flex flex-1 flex-col p-3.5">
        <InstallPrompt variant="compact" />
        <Suspense fallback={null}>
          <TeacherClient user={user} schoolId={activeSchoolId} />
        </Suspense>
      </main>
    </div>
  );
}
