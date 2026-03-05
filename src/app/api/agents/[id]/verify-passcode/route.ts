import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';

// POST /api/agents/[id]/verify-passcode - Verify passcode for a protected agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { passcode } = await request.json();

  if (!passcode) {
    return NextResponse.json({ error: 'Passcode is required' }, { status: 400 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, passcode_hash, visibility')
    .eq('id', id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.visibility !== 'passcode' || !agent.passcode_hash) {
    // No passcode required
    return NextResponse.json({ valid: true });
  }

  const isValid = await bcrypt.compare(passcode, agent.passcode_hash);

  if (!isValid) {
    return NextResponse.json({ valid: false, error: 'Invalid passcode' }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
