import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * GET /api/organizations/[orgId]/members (#2)
 * List organization members.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  const { data: members } = await supabase
    .from('memberships')
    .select('id, user_id, role, created_at, profiles(email, full_name, avatar_url)')
    .eq('org_id', orgId);

  return NextResponse.json({ members: members || [] });
}

/**
 * POST /api/organizations/[orgId]/members (#2)
 * Invite a member to the organization.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify admin/owner role
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const { email, role = 'member' } = body;

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  if (!['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Find user by email
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: 'User not found. They must sign up first.' }, { status: 404 });
  }

  // Check if already a member
  const { data: existingMembership } = await supabase
    .from('memberships')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', targetProfile.id)
    .single();

  if (existingMembership) {
    return NextResponse.json({ error: 'Already a member' }, { status: 409 });
  }

  const { data: newMembership, error } = await supabase
    .from('memberships')
    .insert({
      org_id: orgId,
      user_id: targetProfile.id,
      role,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  recordAuditLog({
    user_id: user.id,
    action: 'member_invited',
    details: { org_id: orgId, invited_user: email, role },
  });

  return NextResponse.json({ membership: newMembership }, { status: 201 });
}

/**
 * DELETE /api/organizations/[orgId]/members (#2)
 * Remove a member from the organization.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const { user_id: targetUserId } = body;

  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
  }

  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  recordAuditLog({
    user_id: user.id,
    action: 'member_removed',
    details: { org_id: orgId, removed_user: targetUserId },
  });

  return NextResponse.json({ ok: true });
}
