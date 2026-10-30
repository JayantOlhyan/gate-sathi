import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { RbacError, requireRole } from '@/lib/rbac';
import { Lead } from '@/models/Lead';

export async function GET() {
  try {
    await requireRole('super_admin');
    await connectDB();

    const leads = await Lead.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      leads: leads.map((lead) => ({
        id: String(lead._id),
        name: lead.name,
        schoolName: lead.schoolName,
        role: lead.role,
        phone: lead.phone,
        message: lead.message,
        createdAt: lead.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof RbacError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
