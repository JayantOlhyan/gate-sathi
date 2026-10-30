import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { authenticateWithPhoneAndPassword } from '@/lib/auth-service';
import { getClientIp } from '@/lib/client-ip';

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
        const ip = getClientIp(request?.headers);
        return await authenticateWithPhoneAndPassword(credentials, { ip });
      },
    }),
  ],
});
