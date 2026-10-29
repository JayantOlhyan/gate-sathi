import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultRouteForRole } from '@/lib/auth-service';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.role) {
    redirect('/login');
  }
  redirect(getDefaultRouteForRole(session.user.role));
}
