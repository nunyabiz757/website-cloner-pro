import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export type Permission =
  | 'view'
  | 'edit'
  | 'comment'
  | 'share'
  | 'delete'
  | 'manage_versions'
  | 'manage_members';

export interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: Role;
  permissions: Permission[];
  addedBy: string;
  addedAt: Date;
  lastActive?: Date;
  avatarUrl?: string;
}

export interface ShareLink {
  id: string;
  projectId: string;
  token: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  accessType: 'view' | 'edit' | 'comment';
  password?: string;
  maxUses?: number;
  usedCount: number;
  isActive: boolean;
  settings: {
    allowDownload: boolean;
    allowCopy: boolean;
    requireApproval: boolean;
  };
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  shareLinks: ShareLink[];
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  isPublic: boolean;
  allowComments: boolean;
  allowVersionHistory: boolean;
  requireApprovalForChanges: boolean;
  notificationsEnabled: boolean;
}

export interface Invitation {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
}

export interface ActivityLog {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface CollaborationStats {
  projectId: string;
  totalMembers: number;
  activeMembers: number; // Active in last 7 days
  totalShareLinks: number;
  activeShareLinks: number;
  totalActivities: number;
  recentActivities: ActivityLog[];
  memberActivity: Array<{
    userId: string;
    name: string;
    actionsCount: number;
    lastActive: Date;
  }>;
}

export class TeamCollaborationService {
  private dataDir: string;
  private readonly rolePermissions: Record<Role, Permission[]> = {
    owner: ['view', 'edit', 'comment', 'share', 'delete', 'manage_versions', 'manage_members'],
    admin: ['view', 'edit', 'comment', 'share', 'manage_versions', 'manage_members'],
    editor: ['view', 'edit', 'comment', 'share', 'manage_versions'],
    viewer: ['view', 'comment'],
  };

  constructor(baseDir: string = './collaboration') {
    this.dataDir = baseDir;
  }

  /**
   * Initialize collaboration data directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'projects'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'invitations'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'activities'), { recursive: true });
      console.log('Team collaboration initialized');
    } catch (error) {
      console.error('Failed to initialize collaboration:', error);
      throw error;
    }
  }

  /**
   * Add a member to a project
   */
  async addMember(
    projectId: string,
    memberData: {
      userId: string;
      email: string;
      name: string;
      role: Role;
      addedBy: string;
    }
  ): Promise<TeamMember> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Check if member already exists
      const existingMember = project.members.find((m) => m.userId === memberData.userId);
      if (existingMember) {
        throw new Error('Member already exists in this project');
      }

      const member: TeamMember = {
        ...memberData,
        permissions: this.rolePermissions[memberData.role],
        addedAt: new Date(),
      };

      project.members.push(member);
      project.updatedAt = new Date();
      await this.saveProject(project);

      // Log activity
      await this.logActivity({
        projectId,
        userId: memberData.addedBy,
        userName: 'System',
        action: 'member_added',
        details: `Added ${memberData.name} as ${memberData.role}`,
      });

      return member;
    } catch (error) {
      console.error('Failed to add member:', error);
      throw error;
    }
  }

  /**
   * Remove a member from a project
   */
  async removeMember(projectId: string, userId: string, removedBy: string): Promise<void> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const memberIndex = project.members.findIndex((m) => m.userId === userId);
      if (memberIndex === -1) {
        throw new Error('Member not found');
      }

      // Cannot remove owner
      if (project.members[memberIndex].role === 'owner') {
        throw new Error('Cannot remove project owner');
      }

      const removedMember = project.members[memberIndex];
      project.members.splice(memberIndex, 1);
      project.updatedAt = new Date();
      await this.saveProject(project);

      // Log activity
      await this.logActivity({
        projectId,
        userId: removedBy,
        userName: 'System',
        action: 'member_removed',
        details: `Removed ${removedMember.name} from project`,
      });
    } catch (error) {
      console.error('Failed to remove member:', error);
      throw error;
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    newRole: Role,
    updatedBy: string
  ): Promise<TeamMember> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const member = project.members.find((m) => m.userId === userId);
      if (!member) {
        throw new Error('Member not found');
      }

      // Cannot change owner role
      if (member.role === 'owner') {
        throw new Error('Cannot change owner role');
      }

      const oldRole = member.role;
      member.role = newRole;
      member.permissions = this.rolePermissions[newRole];

      project.updatedAt = new Date();
      await this.saveProject(project);

      // Log activity
      await this.logActivity({
        projectId,
        userId: updatedBy,
        userName: 'System',
        action: 'role_updated',
        details: `Changed ${member.name}'s role from ${oldRole} to ${newRole}`,
      });

      return member;
    } catch (error) {
      console.error('Failed to update member role:', error);
      throw error;
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    projectId: string,
    userId: string,
    permission: Permission
  ): Promise<boolean> {
    try {
      const project = await this.getProject(projectId);
      if (!project) return false;

      const member = project.members.find((m) => m.userId === userId);
      if (!member) return false;

      return member.permissions.includes(permission);
    } catch (error) {
      console.error('Failed to check permission:', error);
      return false;
    }
  }

  /**
   * Create a share link
   */
  async createShareLink(
    projectId: string,
    createdBy: string,
    options: {
      accessType: 'view' | 'edit' | 'comment';
      expiresIn?: number; // hours
      password?: string;
      maxUses?: number;
      allowDownload?: boolean;
      allowCopy?: boolean;
      requireApproval?: boolean;
    }
  ): Promise<ShareLink> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const token = this.generateToken();
      const expiresAt = options.expiresIn
        ? new Date(Date.now() + options.expiresIn * 60 * 60 * 1000)
        : undefined;

      const shareLink: ShareLink = {
        id: this.generateId(),
        projectId,
        token,
        createdBy,
        createdAt: new Date(),
        expiresAt,
        accessType: options.accessType,
        password: options.password ? this.hashPassword(options.password) : undefined,
        maxUses: options.maxUses,
        usedCount: 0,
        isActive: true,
        settings: {
          allowDownload: options.allowDownload ?? true,
          allowCopy: options.allowCopy ?? true,
          requireApproval: options.requireApproval ?? false,
        },
      };

      project.shareLinks.push(shareLink);
      project.updatedAt = new Date();
      await this.saveProject(project);

      // Log activity
      await this.logActivity({
        projectId,
        userId: createdBy,
        userName: 'System',
        action: 'share_link_created',
        details: `Created ${options.accessType} share link`,
      });

      return shareLink;
    } catch (error) {
      console.error('Failed to create share link:', error);
      throw error;
    }
  }

  /**
   * Validate share link
   */
  async validateShareLink(
    token: string,
    password?: string
  ): Promise<{ valid: boolean; shareLink?: ShareLink; error?: string }> {
    try {
      // Search through all projects for the share link
      const projectsDir = path.join(this.dataDir, 'projects');
      const projectFiles = await fs.readdir(projectsDir);

      for (const file of projectFiles) {
        if (!file.endsWith('.json')) continue;

        const projectPath = path.join(projectsDir, file);
        const content = await fs.readFile(projectPath, 'utf-8');
        const project: Project = JSON.parse(content);

        const shareLink = project.shareLinks.find((sl) => sl.token === token);
        if (shareLink) {
          // Check if active
          if (!shareLink.isActive) {
            return { valid: false, error: 'Share link is inactive' };
          }

          // Check expiration
          if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
            return { valid: false, error: 'Share link has expired' };
          }

          // Check max uses
          if (shareLink.maxUses && shareLink.usedCount >= shareLink.maxUses) {
            return { valid: false, error: 'Share link has reached maximum uses' };
          }

          // Check password
          if (shareLink.password) {
            if (!password || this.hashPassword(password) !== shareLink.password) {
              return { valid: false, error: 'Invalid password' };
            }
          }

          // Increment usage count
          shareLink.usedCount++;
          await this.saveProject(project);

          return { valid: true, shareLink };
        }
      }

      return { valid: false, error: 'Share link not found' };
    } catch (error) {
      console.error('Failed to validate share link:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Revoke share link
   */
  async revokeShareLink(projectId: string, linkId: string, revokedBy: string): Promise<void> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const shareLink = project.shareLinks.find((sl) => sl.id === linkId);
      if (!shareLink) {
        throw new Error('Share link not found');
      }

      shareLink.isActive = false;
      project.updatedAt = new Date();
      await this.saveProject(project);

      // Log activity
      await this.logActivity({
        projectId,
        userId: revokedBy,
        userName: 'System',
        action: 'share_link_revoked',
        details: `Revoked share link`,
      });
    } catch (error) {
      console.error('Failed to revoke share link:', error);
      throw error;
    }
  }

  /**
   * Send invitation
   */
  async sendInvitation(
    projectId: string,
    email: string,
    role: Role,
    invitedBy: string,
    message?: string
  ): Promise<Invitation> {
    try {
      const invitation: Invitation = {
        id: this.generateId(),
        projectId,
        email,
        role,
        invitedBy,
        invitedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending',
        message,
      };

      const invitationPath = path.join(this.dataDir, 'invitations', `${invitation.id}.json`);
      await fs.writeFile(invitationPath, JSON.stringify(invitation, null, 2), 'utf-8');

      // Log activity
      await this.logActivity({
        projectId,
        userId: invitedBy,
        userName: 'System',
        action: 'invitation_sent',
        details: `Sent invitation to ${email} as ${role}`,
      });

      return invitation;
    } catch (error) {
      console.error('Failed to send invitation:', error);
      throw error;
    }
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(
    invitationId: string,
    userId: string,
    userName: string
  ): Promise<TeamMember> {
    try {
      const invitation = await this.getInvitation(invitationId);
      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'pending') {
        throw new Error('Invitation is not pending');
      }

      if (new Date() > invitation.expiresAt) {
        invitation.status = 'expired';
        await this.saveInvitation(invitation);
        throw new Error('Invitation has expired');
      }

      // Add member to project
      const member = await this.addMember(invitation.projectId, {
        userId,
        email: invitation.email,
        name: userName,
        role: invitation.role,
        addedBy: invitation.invitedBy,
      });

      // Update invitation status
      invitation.status = 'accepted';
      await this.saveInvitation(invitation);

      return member;
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      throw error;
    }
  }

  /**
   * Log activity
   */
  async logActivity(activity: {
    projectId: string;
    userId: string;
    userName: string;
    action: string;
    details: string;
    metadata?: Record<string, any>;
  }): Promise<ActivityLog> {
    try {
      const log: ActivityLog = {
        id: this.generateId(),
        ...activity,
        timestamp: new Date(),
      };

      const activityPath = path.join(
        this.dataDir,
        'activities',
        activity.projectId,
        `${log.id}.json`
      );

      await fs.mkdir(path.dirname(activityPath), { recursive: true });
      await fs.writeFile(activityPath, JSON.stringify(log, null, 2), 'utf-8');

      return log;
    } catch (error) {
      console.error('Failed to log activity:', error);
      throw error;
    }
  }

  /**
   * Get project activities
   */
  async getActivities(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ActivityLog[]> {
    try {
      const activitiesDir = path.join(this.dataDir, 'activities', projectId);

      try {
        await fs.access(activitiesDir);
      } catch {
        return [];
      }

      const files = await fs.readdir(activitiesDir);
      const activities: ActivityLog[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const activityPath = path.join(activitiesDir, file);
        const content = await fs.readFile(activityPath, 'utf-8');
        activities.push(JSON.parse(content));
      }

      // Sort by timestamp descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const offset = options?.offset || 0;
      const limit = options?.limit || 50;

      return activities.slice(offset, offset + limit);
    } catch (error) {
      console.error('Failed to get activities:', error);
      return [];
    }
  }

  /**
   * Get collaboration statistics
   */
  async getCollaborationStats(projectId: string): Promise<CollaborationStats> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const activities = await this.getActivities(projectId);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Calculate active members
      const activeMembers = project.members.filter(
        (m) => m.lastActive && new Date(m.lastActive) > sevenDaysAgo
      ).length;

      // Calculate active share links
      const activeShareLinks = project.shareLinks.filter(
        (sl) =>
          sl.isActive &&
          (!sl.expiresAt || new Date(sl.expiresAt) > new Date())
      ).length;

      // Calculate member activity
      const memberActivityMap = new Map<string, { name: string; count: number; lastActive: Date }>();

      activities.forEach((activity) => {
        const existing = memberActivityMap.get(activity.userId) || {
          name: activity.userName,
          count: 0,
          lastActive: new Date(0),
        };
        existing.count++;
        if (new Date(activity.timestamp) > existing.lastActive) {
          existing.lastActive = new Date(activity.timestamp);
        }
        memberActivityMap.set(activity.userId, existing);
      });

      const memberActivity = Array.from(memberActivityMap.entries())
        .map(([userId, data]) => ({
          userId,
          name: data.name,
          actionsCount: data.count,
          lastActive: data.lastActive,
        }))
        .sort((a, b) => b.actionsCount - a.actionsCount);

      return {
        projectId,
        totalMembers: project.members.length,
        activeMembers,
        totalShareLinks: project.shareLinks.length,
        activeShareLinks,
        totalActivities: activities.length,
        recentActivities: activities.slice(0, 10),
        memberActivity,
      };
    } catch (error) {
      console.error('Failed to get collaboration stats:', error);
      throw error;
    }
  }

  // Private helper methods

  private async getProject(projectId: string): Promise<Project | null> {
    try {
      const projectPath = path.join(this.dataDir, 'projects', `${projectId}.json`);
      const content = await fs.readFile(projectPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async saveProject(project: Project): Promise<void> {
    const projectPath = path.join(this.dataDir, 'projects', `${project.id}.json`);
    await fs.writeFile(projectPath, JSON.stringify(project, null, 2), 'utf-8');
  }

  private async getInvitation(invitationId: string): Promise<Invitation | null> {
    try {
      const invitationPath = path.join(this.dataDir, 'invitations', `${invitationId}.json`);
      const content = await fs.readFile(invitationPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async saveInvitation(invitation: Invitation): Promise<void> {
    const invitationPath = path.join(this.dataDir, 'invitations', `${invitation.id}.json`);
    await fs.writeFile(invitationPath, JSON.stringify(invitation, null, 2), 'utf-8');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}
