import type { DefaultSession } from 'next-auth';
import type { Role } from '@/lib/validations';

declare module 'next-auth' {
  interface User {
    id: string;
    name: string;
    phone: string;
    role: Role;
    schoolIds: string[];
    tokenVersion: number;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      phone: string;
      role: Role;
      schoolIds: string[];
      tokenVersion: number;
    } & DefaultSession['user'];
  }
}
