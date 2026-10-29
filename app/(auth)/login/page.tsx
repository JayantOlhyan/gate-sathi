import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultRouteForRole } from '@/lib/auth-service';
import { AppHeader } from '@/components/app-header';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.role) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader showLogout={false} />
      <main className="flex flex-1 items-center justify-center p-4">
        <LoginForm />
      </main>
    </div>
  );
}
