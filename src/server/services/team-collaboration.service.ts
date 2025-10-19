/**
 * Team Collaboration Service
 * Handles team management, member operations, invitations, and template sharing
 */

import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import { nanoid } from 'nanoid';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Team {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    ownerId: string;
    planType: string;
    maxMembers: number;
    maxTemplates: number;
    maxStorageMb: number;
    settings: any;
    avatarUrl: string | null;
    websiteUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    memberCount?: number;
    templateCount?: number;
}

export interface TeamMember {
    id: string;
    teamId: string;
    userId: string;
    role: string;
    permissions: any;
    status: string;
    title: string | null;
    joinedAt: Date;
    lastActiveAt: Date | null;
    userEmail?: string;
    userName?: string;
}

export interface TeamInvitation {
    id: string;
    teamId: string;
    email: string;
    role: string;
    invitedBy: string;
    invitationToken: string;
    message: string | null;
    status: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    createdAt: Date;
}

export interface TeamTemplate {
    id: string;
    teamId: string;
    templateId: string;
    sharedBy: string;
    permissions: any;
    sharedAt: Date;
    lastAccessedAt: Date | null;
    accessCount: number;
    templateName?: string;
    templateThumbnail?: string;
}

export interface TeamActivity {
    id: string;
    teamId: string;
    userId: string | null;
    activityType: string;
    resourceType: string | null;
    resourceId: string | null;
    resourceName: string | null;
    details: any;
    createdAt: Date;
    userEmail?: string;
}

export interface CreateTeamParams {
    name: string;
    slug: string;
    description?: string;
    ownerId: string;
    planType?: string;
    settings?: any;
}

export interface UpdateTeamParams {
    name?: string;
    slug?: string;
    description?: string;
    avatarUrl?: string;
    websiteUrl?: string;
    settings?: any;
}

export interface InviteMemberParams {
    teamId: string;
    email: string;
    role?: string;
    invitedBy: string;
    message?: string;
}

export interface ShareTemplateParams {
    teamId: string;
    templateId: string;
    sharedBy: string;
    permissions?: any;
}

// ============================================================================
// Service Class
// ============================================================================

export class TeamCollaborationService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor(pool: Pool, cache: RedisCacheService) {
        this.pool = pool;
        this.cache = cache;
    }

    // ========================================================================
    // Team Management
    // ========================================================================

    /**
     * Create a new team
     */
    async createTeam(params: CreateTeamParams): Promise<Team> {
        const {
            name,
            slug,
            description,
            ownerId,
            planType = 'free',
            settings = {}
        } = params;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create team
            const teamResult = await client.query(
                `INSERT INTO teams (name, slug, description, owner_id, plan_type, settings)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                 RETURNING *`,
                [name, slug, description || null, ownerId, planType, JSON.stringify(settings)]
            );

            const team = teamResult.rows[0];

            // Add owner as team member
            await client.query(
                `INSERT INTO team_members (team_id, user_id, role, status)
                 VALUES ($1, $2, 'owner', 'active')`,
                [team.id, ownerId]
            );

            await client.query('COMMIT');

            await logAuditEvent({
                userId: ownerId,
                action: 'team:create',
                resource: 'team',
                resourceId: team.id,
                details: { name, slug, planType }
            });

            return this.mapTeamRow(team);

        } catch (error: any) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get team by ID
     */
    async getTeam(teamId: string, userId: string): Promise<Team | null> {
        // Check if user is member
        const isMember = await this.isTeamMember(teamId, userId);
        if (!isMember) {
            throw new Error('Not authorized to view this team');
        }

        const result = await this.pool.query(
            `SELECT t.*,
                    get_team_member_count(t.id) as member_count,
                    get_team_template_count(t.id) as template_count
             FROM teams t
             WHERE t.id = $1`,
            [teamId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapTeamRow(result.rows[0]);
    }

    /**
     * Get user's teams
     */
    async getUserTeams(userId: string): Promise<Team[]> {
        const result = await this.pool.query(
            `SELECT t.*,
                    get_team_member_count(t.id) as member_count,
                    get_team_template_count(t.id) as template_count,
                    tm.role as user_role
             FROM teams t
             JOIN team_members tm ON t.id = tm.team_id
             WHERE tm.user_id = $1 AND tm.status = 'active'
             ORDER BY t.created_at DESC`,
            [userId]
        );

        return result.rows.map(row => this.mapTeamRow(row));
    }

    /**
     * Update team
     */
    async updateTeam(
        teamId: string,
        userId: string,
        params: UpdateTeamParams
    ): Promise<Team> {
        // Check if user is owner or admin
        const role = await this.getUserTeamRole(teamId, userId);
        if (!['owner', 'admin'].includes(role || '')) {
            throw new Error('Not authorized to update this team');
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (params.name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(params.name);
        }
        if (params.slug !== undefined) {
            updates.push(`slug = $${paramCount++}`);
            values.push(params.slug);
        }
        if (params.description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(params.description);
        }
        if (params.avatarUrl !== undefined) {
            updates.push(`avatar_url = $${paramCount++}`);
            values.push(params.avatarUrl);
        }
        if (params.websiteUrl !== undefined) {
            updates.push(`website_url = $${paramCount++}`);
            values.push(params.websiteUrl);
        }
        if (params.settings !== undefined) {
            updates.push(`settings = $${paramCount++}::jsonb`);
            values.push(JSON.stringify(params.settings));
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(teamId);

        const result = await this.pool.query(
            `UPDATE teams
             SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );

        await logAuditEvent({
            userId,
            action: 'team:update',
            resource: 'team',
            resourceId: teamId,
            details: params
        });

        return this.mapTeamRow(result.rows[0]);
    }

    /**
     * Delete team
     */
    async deleteTeam(teamId: string, userId: string): Promise<void> {
        // Check if user is owner
        const team = await this.pool.query(
            `SELECT owner_id FROM teams WHERE id = $1`,
            [teamId]
        );

        if (team.rows.length === 0) {
            throw new Error('Team not found');
        }

        if (team.rows[0].owner_id !== userId) {
            throw new Error('Only team owner can delete the team');
        }

        await this.pool.query(
            `DELETE FROM teams WHERE id = $1`,
            [teamId]
        );

        await logAuditEvent({
            userId,
            action: 'team:delete',
            resource: 'team',
            resourceId: teamId
        });
    }

    // ========================================================================
    // Team Members
    // ========================================================================

    /**
     * Get team members
     */
    async getTeamMembers(teamId: string, userId: string): Promise<TeamMember[]> {
        // Check if user is member
        const isMember = await this.isTeamMember(teamId, userId);
        if (!isMember) {
            throw new Error('Not authorized to view team members');
        }

        const result = await this.pool.query(
            `SELECT tm.*, u.email as user_email, u.name as user_name
             FROM team_members tm
             JOIN users u ON tm.user_id = u.id
             WHERE tm.team_id = $1 AND tm.status = 'active'
             ORDER BY tm.joined_at ASC`,
            [teamId]
        );

        return result.rows.map(row => this.mapMemberRow(row));
    }

    /**
     * Update member role
     */
    async updateMemberRole(
        teamId: string,
        memberId: string,
        newRole: string,
        userId: string
    ): Promise<TeamMember> {
        // Check if user is owner or admin
        const role = await this.getUserTeamRole(teamId, userId);
        if (!['owner', 'admin'].includes(role || '')) {
            throw new Error('Not authorized to update member roles');
        }

        const result = await this.pool.query(
            `UPDATE team_members
             SET role = $1
             WHERE team_id = $2 AND user_id = $3
             RETURNING *`,
            [newRole, teamId, memberId]
        );

        if (result.rows.length === 0) {
            throw new Error('Member not found');
        }

        await this.logTeamActivity(
            teamId,
            userId,
            'member_role_updated',
            'member',
            memberId,
            null,
            { oldRole: role, newRole }
        );

        return this.mapMemberRow(result.rows[0]);
    }

    /**
     * Remove team member
     */
    async removeMember(teamId: string, memberId: string, userId: string): Promise<void> {
        // Check if user is owner or admin
        const role = await this.getUserTeamRole(teamId, userId);
        if (!['owner', 'admin'].includes(role || '')) {
            throw new Error('Not authorized to remove members');
        }

        // Cannot remove owner
        const member = await this.pool.query(
            `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
            [teamId, memberId]
        );

        if (member.rows.length > 0 && member.rows[0].role === 'owner') {
            throw new Error('Cannot remove team owner');
        }

        await this.pool.query(
            `DELETE FROM team_members
             WHERE team_id = $1 AND user_id = $2`,
            [teamId, memberId]
        );

        await logAuditEvent({
            userId,
            action: 'team:member_removed',
            resource: 'team_member',
            resourceId: memberId,
            details: { teamId }
        });
    }

    // ========================================================================
    // Invitations
    // ========================================================================

    /**
     * Invite member to team
     */
    async inviteMember(params: InviteMemberParams): Promise<TeamInvitation> {
        const {
            teamId,
            email,
            role = 'member',
            invitedBy,
            message
        } = params;

        // Check if user can invite
        const userRole = await this.getUserTeamRole(teamId, invitedBy);
        if (!['owner', 'admin'].includes(userRole || '')) {
            throw new Error('Not authorized to invite members');
        }

        // Check member limit
        const canAdd = await this.pool.query(
            `SELECT check_team_member_limit($1) as can_add`,
            [teamId]
        );

        if (!canAdd.rows[0].can_add) {
            throw new Error('Team member limit reached');
        }

        // Check if user is already a member
        const existingMember = await this.pool.query(
            `SELECT id FROM team_members
             WHERE team_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
            [teamId, email]
        );

        if (existingMember.rows.length > 0) {
            throw new Error('User is already a team member');
        }

        // Create invitation token
        const invitationToken = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const result = await this.pool.query(
            `INSERT INTO team_invitations (
                team_id, email, role, invited_by, invitation_token, message, expires_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [teamId, email, role, invitedBy, invitationToken, message || null, expiresAt]
        );

        await this.logTeamActivity(
            teamId,
            invitedBy,
            'member_invited',
            'invitation',
            result.rows[0].id,
            email,
            { role }
        );

        return this.mapInvitationRow(result.rows[0]);
    }

    /**
     * Accept invitation
     */
    async acceptInvitation(invitationToken: string, userId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Get invitation
            const invitation = await client.query(
                `SELECT * FROM team_invitations
                 WHERE invitation_token = $1 AND status = 'pending'`,
                [invitationToken]
            );

            if (invitation.rows.length === 0) {
                throw new Error('Invalid or expired invitation');
            }

            const inv = invitation.rows[0];

            // Check expiration
            if (new Date(inv.expires_at) < new Date()) {
                await client.query(
                    `UPDATE team_invitations SET status = 'expired' WHERE id = $1`,
                    [inv.id]
                );
                throw new Error('Invitation has expired');
            }

            // Verify email matches
            const user = await client.query(
                `SELECT email FROM users WHERE id = $1`,
                [userId]
            );

            if (user.rows[0].email !== inv.email) {
                throw new Error('Invitation email does not match your account');
            }

            // Add member
            await client.query(
                `INSERT INTO team_members (team_id, user_id, role, status)
                 VALUES ($1, $2, $3, 'active')`,
                [inv.team_id, userId, inv.role]
            );

            // Update invitation
            await client.query(
                `UPDATE team_invitations
                 SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [inv.id]
            );

            await client.query('COMMIT');

            await logAuditEvent({
                userId,
                action: 'team:invitation_accepted',
                resource: 'team_invitation',
                resourceId: inv.id,
                details: { teamId: inv.team_id }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Decline invitation
     */
    async declineInvitation(invitationToken: string): Promise<void> {
        await this.pool.query(
            `UPDATE team_invitations
             SET status = 'declined', declined_at = CURRENT_TIMESTAMP
             WHERE invitation_token = $1 AND status = 'pending'`,
            [invitationToken]
        );
    }

    /**
     * Get team invitations
     */
    async getTeamInvitations(teamId: string, userId: string): Promise<TeamInvitation[]> {
        // Check if user is owner or admin
        const role = await this.getUserTeamRole(teamId, userId);
        if (!['owner', 'admin'].includes(role || '')) {
            throw new Error('Not authorized to view invitations');
        }

        const result = await this.pool.query(
            `SELECT * FROM team_invitations
             WHERE team_id = $1
             ORDER BY created_at DESC`,
            [teamId]
        );

        return result.rows.map(row => this.mapInvitationRow(row));
    }

    // ========================================================================
    // Template Sharing
    // ========================================================================

    /**
     * Share template with team
     */
    async shareTemplate(params: ShareTemplateParams): Promise<TeamTemplate> {
        const {
            teamId,
            templateId,
            sharedBy,
            permissions = { view: true, edit: false, delete: false, share: false, download: true }
        } = params;

        // Check if user is member
        const isMember = await this.isTeamMember(teamId, sharedBy);
        if (!isMember) {
            throw new Error('Not authorized to share templates with this team');
        }

        // Check if already shared
        const existing = await this.pool.query(
            `SELECT id FROM team_templates WHERE team_id = $1 AND template_id = $2`,
            [teamId, templateId]
        );

        if (existing.rows.length > 0) {
            throw new Error('Template already shared with this team');
        }

        const result = await this.pool.query(
            `INSERT INTO team_templates (team_id, template_id, shared_by, permissions)
             VALUES ($1, $2, $3, $4::jsonb)
             RETURNING *`,
            [teamId, templateId, sharedBy, JSON.stringify(permissions)]
        );

        await this.logTeamActivity(
            teamId,
            sharedBy,
            'template_shared',
            'template',
            templateId,
            null,
            { permissions }
        );

        return this.mapTeamTemplateRow(result.rows[0]);
    }

    /**
     * Get team templates
     */
    async getTeamTemplates(teamId: string, userId: string): Promise<TeamTemplate[]> {
        // Check if user is member
        const isMember = await this.isTeamMember(teamId, userId);
        if (!isMember) {
            throw new Error('Not authorized to view team templates');
        }

        const result = await this.pool.query(
            `SELECT tt.*, t.name as template_name, t.preview_image_url as template_thumbnail
             FROM team_templates tt
             JOIN ghl_clone_templates t ON tt.template_id = t.id
             WHERE tt.team_id = $1
             ORDER BY tt.shared_at DESC`,
            [teamId]
        );

        return result.rows.map(row => this.mapTeamTemplateRow(row));
    }

    /**
     * Remove shared template
     */
    async removeSharedTemplate(teamId: string, templateId: string, userId: string): Promise<void> {
        // Check if user is owner/admin or the one who shared
        const template = await this.pool.query(
            `SELECT shared_by FROM team_templates WHERE team_id = $1 AND template_id = $2`,
            [teamId, templateId]
        );

        if (template.rows.length === 0) {
            throw new Error('Shared template not found');
        }

        const role = await this.getUserTeamRole(teamId, userId);
        const isSharer = template.rows[0].shared_by === userId;

        if (!['owner', 'admin'].includes(role || '') && !isSharer) {
            throw new Error('Not authorized to remove this shared template');
        }

        await this.pool.query(
            `DELETE FROM team_templates WHERE team_id = $1 AND template_id = $2`,
            [teamId, templateId]
        );

        await this.logTeamActivity(
            teamId,
            userId,
            'template_unshared',
            'template',
            templateId
        );
    }

    // ========================================================================
    // Team Activity
    // ========================================================================

    /**
     * Get team activity log
     */
    async getTeamActivity(
        teamId: string,
        userId: string,
        limit: number = 50
    ): Promise<TeamActivity[]> {
        // Check if user is member
        const isMember = await this.isTeamMember(teamId, userId);
        if (!isMember) {
            throw new Error('Not authorized to view team activity');
        }

        const result = await this.pool.query(
            `SELECT ta.*, u.email as user_email
             FROM team_activity_log ta
             LEFT JOIN users u ON ta.user_id = u.id
             WHERE ta.team_id = $1
             ORDER BY ta.created_at DESC
             LIMIT $2`,
            [teamId, limit]
        );

        return result.rows.map(row => this.mapActivityRow(row));
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Check if user is team member
     */
    private async isTeamMember(teamId: string, userId: string): Promise<boolean> {
        const result = await this.pool.query(
            `SELECT is_team_member($1, $2) as is_member`,
            [teamId, userId]
        );
        return result.rows[0].is_member;
    }

    /**
     * Get user's role in team
     */
    private async getUserTeamRole(teamId: string, userId: string): Promise<string | null> {
        const result = await this.pool.query(
            `SELECT get_user_team_role($1, $2) as role`,
            [teamId, userId]
        );
        return result.rows[0].role;
    }

    /**
     * Log team activity
     */
    private async logTeamActivity(
        teamId: string,
        userId: string,
        activityType: string,
        resourceType?: string,
        resourceId?: string,
        resourceName?: string,
        details?: any
    ): Promise<void> {
        await this.pool.query(
            `SELECT log_team_activity($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
                teamId,
                userId,
                activityType,
                resourceType || null,
                resourceId || null,
                resourceName || null,
                JSON.stringify(details || {})
            ]
        );
    }

    /**
     * Map database row to Team
     */
    private mapTeamRow(row: any): Team {
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            ownerId: row.owner_id,
            planType: row.plan_type,
            maxMembers: row.max_members,
            maxTemplates: row.max_templates,
            maxStorageMb: row.max_storage_mb,
            settings: row.settings,
            avatarUrl: row.avatar_url,
            websiteUrl: row.website_url,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            memberCount: row.member_count,
            templateCount: row.template_count
        };
    }

    /**
     * Map database row to TeamMember
     */
    private mapMemberRow(row: any): TeamMember {
        return {
            id: row.id,
            teamId: row.team_id,
            userId: row.user_id,
            role: row.role,
            permissions: row.permissions,
            status: row.status,
            title: row.title,
            joinedAt: new Date(row.joined_at),
            lastActiveAt: row.last_active_at ? new Date(row.last_active_at) : null,
            userEmail: row.user_email,
            userName: row.user_name
        };
    }

    /**
     * Map database row to TeamInvitation
     */
    private mapInvitationRow(row: any): TeamInvitation {
        return {
            id: row.id,
            teamId: row.team_id,
            email: row.email,
            role: row.role,
            invitedBy: row.invited_by,
            invitationToken: row.invitation_token,
            message: row.message,
            status: row.status,
            expiresAt: new Date(row.expires_at),
            acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
            declinedAt: row.declined_at ? new Date(row.declined_at) : null,
            createdAt: new Date(row.created_at)
        };
    }

    /**
     * Map database row to TeamTemplate
     */
    private mapTeamTemplateRow(row: any): TeamTemplate {
        return {
            id: row.id,
            teamId: row.team_id,
            templateId: row.template_id,
            sharedBy: row.shared_by,
            permissions: row.permissions,
            sharedAt: new Date(row.shared_at),
            lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : null,
            accessCount: row.access_count,
            templateName: row.template_name,
            templateThumbnail: row.template_thumbnail
        };
    }

    /**
     * Map database row to TeamActivity
     */
    private mapActivityRow(row: any): TeamActivity {
        return {
            id: row.id,
            teamId: row.team_id,
            userId: row.user_id,
            activityType: row.activity_type,
            resourceType: row.resource_type,
            resourceId: row.resource_id,
            resourceName: row.resource_name,
            details: row.details,
            createdAt: new Date(row.created_at),
            userEmail: row.user_email
        };
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let teamCollaborationServiceInstance: TeamCollaborationService | null = null;

export async function getTeamCollaborationService(): Promise<TeamCollaborationService> {
    if (!teamCollaborationServiceInstance) {
        const pool = getPool();
        const cache = new RedisCacheService();
        await cache.initialize();
        teamCollaborationServiceInstance = new TeamCollaborationService(pool, cache);
    }
    return teamCollaborationServiceInstance;
}
