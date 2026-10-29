import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { authenticateWithPhoneAndPassword } from '@/lib/auth-service';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        phone: { label: 'Phone', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        try {
          const forwardedFor = request?.headers?.get('x-forwarded-for');
          const ip = forwardedFor?.split(',')[0]?.trim() || '127.0.0.1';
          return await authenticateWithPhoneAndPassword(credentials, { ip });
        } catch {
          return null;
        }
      },
    }),
  ],
});
