import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';
import { StudentDetailClient } from './student-detail-client';

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ schoolId?: string }>;
}) {
  const { studentId } = await params;
  const { schoolId: querySchoolId } = await searchParams;
  let activeSchoolId = '';

  try {
    const user = await requireRole('principal', 'super_admin');
    const targetSchoolId = user.schoolIds[0] ?? querySchoolId;
    if (!targetSchoolId) {
      redirect('/students');
    }
    const access = await requireSchoolAccess(targetSchoolId);
    activeSchoolId = access.schoolId;
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
        <StudentDetailClient schoolId={activeSchoolId} studentId={studentId} />
      </main>
    </div>
  );
}
