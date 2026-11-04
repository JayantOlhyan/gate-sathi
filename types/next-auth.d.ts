import type { DefaultSession } from 'next-auth';
import type { Role } from '@/lib/validations';

export interface ClassAssignmentPayload {
  schoolId: string;
  className: string;
  section: string;
}

declare module 'next-auth' {
  interface User {
    id: string;
    name: string;
    phone: string;
    role: Role;
    schoolIds: string[];
    classAssignments?: ClassAssignmentPayload[];
    tokenVersion: number;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      phone: string;
      role: Role;
      schoolIds: string[];
      classAssignments?: ClassAssignmentPayload[];
      tokenVersion: number;
    } & DefaultSession['user'];
  }
}
