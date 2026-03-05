'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, Users, Crown, Shield, UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_id: string;
  created_at: string;
  role: string;
}

interface Member {
  user_id: string;
  role: string;
  email?: string;
  created_at: string;
}

const roleIcons: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
};

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchOrgs();
  }, []);

  async function fetchOrgs() {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      setOrgs(data.organizations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function fetchMembers(orgId: string) {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      setMembers([]);
    }
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      if (res.ok) {
        setNewOrgName('');
        setShowCreate(false);
        fetchOrgs();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite() {
    if (!selectedOrg || !inviteEmail.trim() || inviting) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        setInviteEmail('');
        fetchMembers(selectedOrg.id);
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedOrg) return;
    await fetch(`/api/organizations/${selectedOrg.id}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    fetchMembers(selectedOrg.id);
  }

  function selectOrg(org: Organization) {
    setSelectedOrg(org);
    fetchMembers(org.id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-sm text-muted-foreground">Manage your teams and organizations</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Organization
        </button>
      </div>

      {/* Create org form */}
      {showCreate && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-medium">Create Organization</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Organization name"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
            />
            <button
              onClick={handleCreateOrg}
              disabled={creating || !newOrgName.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Org list */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Your Organizations</h2>
          {orgs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Building2 className="mx-auto mb-2 h-8 w-8" />
              No organizations yet
            </div>
          ) : (
            orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => selectOrg(org)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition-colors hover:bg-accent/50',
                  selectedOrg?.id === org.id && 'border-primary bg-accent/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">
                    {org.role}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Members panel */}
        <div className="space-y-3">
          {selectedOrg ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Members of {selectedOrg.name}
                </h2>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Invite form */}
              {(selectedOrg.role === 'owner' || selectedOrg.role === 'admin') && (
                <div className="rounded-lg border bg-card p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Invite Member</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="rounded-md border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {inviting ? '...' : 'Invite'}
                    </button>
                  </div>
                </div>
              )}

              {/* Member list */}
              <div className="space-y-2">
                {members.map((member) => {
                  const RoleIcon = roleIcons[member.role] || UserIcon;
                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <RoleIcon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{member.email || member.user_id.slice(0, 8)}</p>
                          <p className="text-xs capitalize text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                      {selectedOrg.role === 'owner' && member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="text-xs text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
                {members.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No members found</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
              Select an organization to manage members
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
