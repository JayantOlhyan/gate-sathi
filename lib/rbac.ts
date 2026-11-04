import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { ROLES, type Role } from '@/lib/validations';

const schoolIdInputSchema = z.string().trim().min(1, 'schoolId is required');
const roleInputSchema = z.enum(ROLES);

export class RbacError extends Error {
  status: 400 | 401 | 403;
  constructor(message: string, status: 400 | 401 | 403) {
    super(message);
    this.name = 'RbacError';
    this.status = status;
  }
}

export interface SessionUser {
  id: string;
  name?: string | null;
  phone: string;
  role: Role;
  schoolIds: string[];
  classAssignments?: Array<{ schoolId: string; className: string; section: string }>;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const parsedRoles = z.array(roleInputSchema).nonempty().safeParse(roles);
  if (!parsedRoles.success) {
    throw new RbacError('Invalid role configuration', 400);
  }

  const session = await auth();
  const user = session?.user;

  if (!user || !user.id || !user.role) {
    throw new RbacError('Unauthorized: authentication required', 401);
  }

  if (!parsedRoles.data.includes(user.role)) {
    throw new RbacError('Forbidden: insufficient role permissions', 403);
  }

  return user;
}

export async function requireSchoolAccess(schoolId: string): Promise<{
  user: SessionUser;
  schoolId: string;
}> {
  const parsedSchoolId = schoolIdInputSchema.safeParse(schoolId);
  if (!parsedSchoolId.success) {
    throw new RbacError('Invalid schoolId parameter', 400);
  }

  const session = await auth();
  const user = session?.user;

  if (!user || !user.id || !user.role) {
    throw new RbacError('Unauthorized: authentication required', 401);
  }

  if (user.role === 'super_admin') {
    return { user, schoolId: parsedSchoolId.data };
  }

  const allowedSchoolIds = Array.isArray(user.schoolIds) ? user.schoolIds.map(String) : [];
  if (!allowedSchoolIds.includes(parsedSchoolId.data)) {
    throw new RbacError('Forbidden: no access to requested school resource', 403);
  }

  return { user, schoolId: parsedSchoolId.data };
}

export async function requireTeacherClassAccess(
  schoolId: string,
  className?: string,
  section?: string
): Promise<{ user: SessionUser; schoolId: string }> {
  const { user } = await requireSchoolAccess(schoolId);
  if (user.role === 'principal' || user.role === 'super_admin') {
    return { user, schoolId };
  }
  if (user.role !== 'teacher') {
    throw new RbacError('Forbidden: teacher access required', 403);
  }
  if (className && section) {
    const assignments = user.classAssignments || [];
    const hasAccess = assignments.some(
      (a) =>
        String(a.schoolId) === String(schoolId) &&
        String(a.className).trim().toLowerCase() === String(className).trim().toLowerCase() &&
        String(a.section).trim().toUpperCase() === String(section).trim().toUpperCase()
    );
    if (!hasAccess) {
      throw new RbacError(
        'Forbidden: teacher is not assigned to this class and section',
        403
      );
    }
  }
  return { user, schoolId };
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof RbacError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'OtpError' &&
    'status' in error
  ) {
    return NextResponse.json(
      { error: (error as unknown as Error).message },
      { status: (error as { status: number }).status }
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: error.flatten() },
      { status: 400 }
    );
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'ImportValidationError'
  ) {
    return NextResponse.json(
      { error: (error as unknown as Error).message },
      { status: 400 }
    );
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  ) {
    return NextResponse.json(
      { error: 'Duplicate resource violates unique constraint' },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
