import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Share2,
  Mail,
  Shield,
  Link as LinkIcon,
  Copy,
  Trash2,
  AlertCircle,
  Loader,
  Eye,
  Edit,
  MessageSquare,
  X,
} from 'lucide-react';

type Role = 'owner' | 'admin' | 'editor' | 'viewer';

interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: Role;
  permissions: string[];
  addedBy: string;
  addedAt: string;
  lastActive?: string;
  avatarUrl?: string;
}

interface ShareLink {
  id: string;
  token: string;
  accessType: 'view' | 'edit' | 'comment';
  createdAt: string;
  expiresAt?: string;
  usedCount: number;
  maxUses?: number;
  isActive: boolean;
}

interface TeamManagementProps {
  projectId: string;
  currentUserId: string;
  currentUserRole: Role;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({
  projectId,
  currentUserId,
  currentUserRole,
}) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareLinkModal, setShowShareLinkModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'links'>('members');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [inviteMessage, setInviteMessage] = useState('');

  // Share link form state
  const [linkAccessType, setLinkAccessType] = useState<'view' | 'edit' | 'comment'>('view');
  const [linkExpires, setLinkExpires] = useState<number>(168); // 7 days
  const [linkPassword, setLinkPassword] = useState('');
  const [linkMaxUses, setLinkMaxUses] = useState<number | undefined>(undefined);

  const canManageMembers = ['owner', 'admin'].includes(currentUserRole);

  const roles: Array<{ value: Role; label: string; description: string }> = [
    {
      value: 'owner',
      label: 'Owner',
      description: 'Full control including deletion',
    },
    {
      value: 'admin',
      label: 'Admin',
      description: 'Manage members and all settings',
    },
    {
      value: 'editor',
      label: 'Editor',
      description: 'Edit content and manage versions',
    },
    {
      value: 'viewer',
      label: 'Viewer',
      description: 'View only, can comment',
    },
  ];

  const inviteMember = async () => {
    if (!inviteEmail) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/collaboration/members/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userId: `user_${Date.now()}`, // Generate temporary ID
          email: inviteEmail,
          name: inviteEmail.split('@')[0],
          role: inviteRole,
          addedBy: currentUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to invite member');
      }

      setMembers((prev) => [...prev, data.data]);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('viewer');
      setInviteMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed');
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    try {
      const response = await fetch(`/api/collaboration/members/${projectId}/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removedBy: currentUserId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove member');
      }

      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const updateMemberRole = async (userId: string, newRole: Role) => {
    try {
      const response = await fetch('/api/collaboration/members/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userId,
          newRole,
          updatedBy: currentUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update role');
      }

      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const createShareLink = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/collaboration/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          createdBy: currentUserId,
          accessType: linkAccessType,
          expiresIn: linkExpires,
          password: linkPassword || undefined,
          maxUses: linkMaxUses,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create share link');
      }

      setShareLinks((prev) => [...prev, data.data]);
      setShowShareLinkModal(false);
      setLinkPassword('');
      setLinkMaxUses(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setLoading(false);
    }
  };

  const revokeShareLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this share link?')) {
      return;
    }

    try {
      const response = await fetch(`/api/collaboration/share/${projectId}/${linkId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokedBy: currentUserId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke link');
      }

      setShareLinks((prev) =>
        prev.map((link) => (link.id === linkId ? { ...link, isActive: false } : link))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke link');
    }
  };

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    // Could add toast notification here
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case 'owner':
        return <Shield className="w-4 h-4 text-purple-600" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-blue-600" />;
      case 'editor':
        return <Edit className="w-4 h-4 text-green-600" />;
      case 'viewer':
        return <Eye className="w-4 h-4 text-gray-600" />;
    }
  };

  const getAccessIcon = (accessType: 'view' | 'edit' | 'comment') => {
    switch (accessType) {
      case 'view':
        return <Eye className="w-4 h-4" />;
      case 'edit':
        return <Edit className="w-4 h-4" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Team Management</h2>
            <p className="text-gray-600">Manage team members and share access</p>
          </div>
        </div>

        {canManageMembers && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
            <button
              onClick={() => setShowShareLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Create Link
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'links'
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LinkIcon className="w-4 h-4 inline mr-2" />
            Share Links ({shareLinks.length})
          </button>
        </div>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No team members yet</p>
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{member.name}</h3>
                    <p className="text-sm text-gray-600">{member.email}</p>
                    {member.lastActive && (
                      <p className="text-xs text-gray-500 mt-1">
                        Last active: {formatDate(member.lastActive)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {canManageMembers && member.role !== 'owner' ? (
                    <select
                      value={member.role}
                      onChange={(e) => updateMemberRole(member.userId, e.target.value as Role)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {roles
                        .filter((r) => r.value !== 'owner')
                        .map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                      {getRoleIcon(member.role)}
                      <span className="text-sm font-medium capitalize">{member.role}</span>
                    </div>
                  )}

                  {canManageMembers && member.role !== 'owner' && member.userId !== currentUserId && (
                    <button
                      onClick={() => removeMember(member.userId)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Share Links Tab */}
      {activeTab === 'links' && (
        <div className="space-y-3">
          {shareLinks.length === 0 ? (
            <div className="text-center py-12">
              <LinkIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No share links created</p>
            </div>
          ) : (
            shareLinks.map((link) => (
              <div
                key={link.id}
                className={`p-4 border rounded-lg ${
                  link.isActive ? 'border-gray-200' : 'border-gray-300 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded">
                        {getAccessIcon(link.accessType)}
                        <span className="text-sm font-medium capitalize">{link.accessType}</span>
                      </div>
                      {!link.isActive && (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                          Revoked
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-600 space-y-1">
                      <p>Created: {formatDate(link.createdAt)}</p>
                      {link.expiresAt && <p>Expires: {formatDate(link.expiresAt)}</p>}
                      <p>
                        Used: {link.usedCount}
                        {link.maxUses ? ` / ${link.maxUses}` : ' times'}
                      </p>
                    </div>
                  </div>

                  {link.isActive && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyShareLink(link.token)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Copy link"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      {canManageMembers && (
                        <button
                          onClick={() => revokeShareLink(link.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Revoke link"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {roles.filter((r) => r.value !== 'owner').map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message (Optional)
                </label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Personal message..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={inviteMember}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      Send Invitation
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Share Link Modal */}
      {showShareLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Create Share Link</h3>
              <button
                onClick={() => setShowShareLinkModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Access Type
                </label>
                <select
                  value={linkAccessType}
                  onChange={(e) => setLinkAccessType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="view">View Only</option>
                  <option value="comment">Can Comment</option>
                  <option value="edit">Can Edit</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expires In (hours)
                </label>
                <input
                  type="number"
                  value={linkExpires}
                  onChange={(e) => setLinkExpires(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password (Optional)
                </label>
                <input
                  type="password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="Leave empty for no password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Uses (Optional)
                </label>
                <input
                  type="number"
                  value={linkMaxUses || ''}
                  onChange={(e) =>
                    setLinkMaxUses(e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  placeholder="Unlimited"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={createShareLink}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <LinkIcon className="w-5 h-5" />
                      Create Link
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowShareLinkModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
