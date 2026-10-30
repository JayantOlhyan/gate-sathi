import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { connectDB } from '@/lib/db';
import { RbacError, requireRole } from '@/lib/rbac';
import { Lead } from '@/models/Lead';

export default async function AdminLeadsPage() {
  try {
    await requireRole('super_admin');
  } catch (error) {
    if (error instanceof RbacError && error.status === 401) {
      redirect('/login');
    }
    return (
      <div className="flex flex-1 flex-col">
        <AppHeader showLogout />
        <main className="flex-1 p-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-red-700">
                403 — Forbidden
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-600">
              Only super_admin can view pilot requests.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  await connectDB();
  const leads = await Lead.find({}).sort({ createdAt: -1 }).limit(200).lean();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader showLogout />
      <main className="flex-1 space-y-3 p-4">
        <h1 className="text-base font-bold text-slate-900">
          Pilot Requests ({leads.length})
        </h1>
        {leads.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-white p-4 text-xs text-slate-600">
            No pilot requests yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {leads.map((lead) => (
              <Card key={String(lead._id)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    {lead.schoolName}
                  </CardTitle>
                  <p className="text-xs text-slate-600">
                    {lead.name} ({lead.role}) · {lead.phone}
                  </p>
                </CardHeader>
                {lead.message ? (
                  <CardContent className="pt-0 text-xs text-slate-700">
                    {lead.message}
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
