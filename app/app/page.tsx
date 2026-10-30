import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultRouteForRole } from '@/lib/auth-service';

export default async function AppRedirectPage() {
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (!session?.user?.id || !session.user.role) {
    redirect('/login');
  }
  redirect(getDefaultRouteForRole(session.user.role));
}
