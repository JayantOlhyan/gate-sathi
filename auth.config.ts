import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@/lib/validations';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.phone = user.phone;
        token.role = user.role;
        token.schoolIds = user.schoolIds;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? '');
        session.user.phone = String(token.phone ?? '');
        session.user.role = (token.role as Role) ?? 'guard';
        session.user.schoolIds = Array.isArray(token.schoolIds)
          ? token.schoolIds.map(String)
          : [];
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
