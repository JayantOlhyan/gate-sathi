import type { NextAuthConfig } from 'next-auth';
import {
  SESSION_MAX_AGE_SECONDS,
  verifyAndRefreshJwtToken,
  type AuthenticatedUser,
} from '@/lib/auth-service';
import type { Role } from '@/lib/validations';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS, // 8 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      return await verifyAndRefreshJwtToken(
        token,
        user as AuthenticatedUser | undefined
      );
    },
    async session({ session, token }) {
      if (token.invalidated || !token.id) {
        return {
          ...session,
          user: {
            id: '',
            name: '',
            phone: '',
            role: 'guard',
            schoolIds: [],
            tokenVersion: -1,
          },
        };
      }

      if (session.user) {
        session.user.id = String(token.id ?? '');
        session.user.phone = String(token.phone ?? '');
        session.user.role = (token.role as Role) ?? 'guard';
        session.user.schoolIds = Array.isArray(token.schoolIds)
          ? token.schoolIds.map(String)
          : [];
        session.user.tokenVersion =
          typeof token.tokenVersion === 'number' ? token.tokenVersion : 0;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
