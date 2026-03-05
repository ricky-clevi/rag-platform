import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * GET /api/organizations (#2)
 * List user's organizations.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: memberships } = await supabase
    .from('memberships')
    .select('org_id, role, organizations(id, name, slug, plan, owner_id, created_at)')
    .eq('user_id', user.id);

  const orgs = (memberships || []).map((m) => ({
    ...m.organizations,
    role: m.role,
  }));

  return NextResponse.json({ organizations: orgs });
}

/**
 * POST /api/organizations (#2)
 * Create a new organization.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name: name.trim(),
      slug: `${slug}-${Date.now().toString(36)}`,
      owner_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add owner as member
  await supabase.from('memberships').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
  });

  recordAuditLog({
    user_id: user.id,
    action: 'organization_created',
    details: { org_id: org.id, name: org.name },
  });

  return NextResponse.json({ organization: org }, { status: 201 });
}
