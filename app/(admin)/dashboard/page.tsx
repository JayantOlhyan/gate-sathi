import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppHeader } from '@/components/app-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RbacError, requireRole, requireSchoolAccess } from '@/lib/rbac';

export default async function DashboardPage() {
  let user;
  let activeSchoolId = '';

  try {
    user = await requireRole('principal', 'super_admin');
    const primarySchoolId = user.schoolIds[0];
    if (primarySchoolId) {
      const access = await requireSchoolAccess(primarySchoolId);
      activeSchoolId = access.schoolId;
    }
  } catch (error) {
    if (error instanceof RbacError && error.status === 401) {
      redirect('/login');
    }
    redirect('/gate');
  }

  const t = await getTranslations('dashboard');

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader showLogout />
      <main className="flex-1 space-y-4 p-4">
        <Card>
          <CardHeader>
            <span className="inline-block w-fit rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
              {t('badge')}
            </span>
            <CardTitle className="pt-1">{t('title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>{t('placeholder')}</p>
            {activeSchoolId && (
              <p className="rounded bg-slate-100 p-2 font-mono text-xs text-slate-700">
                {t('assignedSchool')}: {activeSchoolId}
              </p>
            )}
            <Link
              href="/students"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-blue/90"
            >
              {t('manageStudents')}
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
