import { auth } from '@/auth';
import {
  LandingClient,
  type LandingSessionUser,
} from '@/components/landing-client';

export default async function HomePage() {
  let sessionUser: LandingSessionUser | null = null;
  try {
    const session = await auth();
    if (session?.user?.id && session.user.role) {
      sessionUser = {
        id: session.user.id,
        phone: session.user.phone,
        role: session.user.role,
      };
    }
  } catch {
    sessionUser = null;
  }

  return <LandingClient sessionUser={sessionUser} />;
}
