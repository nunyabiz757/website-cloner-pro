-- Migration: Resource Ownership Validation
-- Description: Comprehensive resource ownership tracking and transfer functionality
-- Created: 2025-01-15

-- Resource ownership tracking table
CREATE TABLE IF NOT EXISTS resource_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_resource_ownership UNIQUE (resource_type, resource_id)
);

-- Ownership transfer history
CREATE TABLE IF NOT EXISTS ownership_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    from_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transferred_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB,
    transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT no_self_transfer CHECK (from_owner_id != to_owner_id)
);

-- Shared resource access table
CREATE TABLE IF NOT EXISTS shared_resource_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_with_role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_level VARCHAR(50) NOT NULL, -- 'read', 'write', 'admin'
    shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_permission_level CHECK (permission_level IN ('read', 'write', 'admin')),
    CONSTRAINT share_target CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_role_id IS NULL) OR
        (shared_with_user_id IS NULL AND shared_with_role_id IS NOT NULL)
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_resource_ownership_type_id ON resource_ownership(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_ownership_owner ON resource_ownership(owner_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_resource ON ownership_transfers(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_from ON ownership_transfers(from_owner_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_to ON ownership_transfers(to_owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_resource ON shared_resource_access(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_user ON shared_resource_access(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_role ON shared_resource_access(shared_with_role_id);
CREATE INDEX IF NOT EXISTS idx_shared_access_expires ON shared_resource_access(expires_at);

-- Function to check if user owns a resource
CREATE OR REPLACE FUNCTION user_owns_resource(
    p_user_id UUID,
    p_resource_type VARCHAR,
    p_resource_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM resource_ownership
        WHERE owner_id = p_user_id
        AND resource_type = p_resource_type
        AND resource_id = p_resource_id
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has access to a resource (owner or shared)
CREATE OR REPLACE FUNCTION user_has_resource_access(
    p_user_id UUID,
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_permission_level VARCHAR DEFAULT 'read'
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_owner BOOLEAN;
    v_has_direct_share BOOLEAN;
    v_has_role_share BOOLEAN;
BEGIN
    -- Check if user is owner
    v_is_owner := user_owns_resource(p_user_id, p_resource_type, p_resource_id);
    IF v_is_owner THEN
        RETURN TRUE;
    END IF;

    -- Check direct user share
    SELECT EXISTS(
        SELECT 1 FROM shared_resource_access
        WHERE resource_type = p_resource_type
        AND resource_id = p_resource_id
        AND shared_with_user_id = p_user_id
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        AND CASE p_permission_level
            WHEN 'read' THEN permission_level IN ('read', 'write', 'admin')
            WHEN 'write' THEN permission_level IN ('write', 'admin')
            WHEN 'admin' THEN permission_level = 'admin'
            ELSE FALSE
        END
    ) INTO v_has_direct_share;

    IF v_has_direct_share THEN
        RETURN TRUE;
    END IF;

    -- Check role-based share
    SELECT EXISTS(
        SELECT 1 FROM shared_resource_access sra
        INNER JOIN user_roles ur ON ur.role_id = sra.shared_with_role_id
        WHERE sra.resource_type = p_resource_type
        AND sra.resource_id = p_resource_id
        AND ur.user_id = p_user_id
        AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
        AND (sra.expires_at IS NULL OR sra.expires_at > CURRENT_TIMESTAMP)
        AND CASE p_permission_level
            WHEN 'read' THEN sra.permission_level IN ('read', 'write', 'admin')
            WHEN 'write' THEN sra.permission_level IN ('write', 'admin')
            WHEN 'admin' THEN sra.permission_level = 'admin'
            ELSE FALSE
        END
    ) INTO v_has_role_share;

    RETURN v_has_role_share;
END;
$$ LANGUAGE plpgsql;

-- Function to register resource ownership
CREATE OR REPLACE FUNCTION register_resource_ownership(
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_owner_id UUID,
    p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_ownership_id UUID;
BEGIN
    INSERT INTO resource_ownership (
        resource_type,
        resource_id,
        owner_id,
        created_by
    ) VALUES (
        p_resource_type,
        p_resource_id,
        p_owner_id,
        COALESCE(p_created_by, p_owner_id)
    )
    ON CONFLICT (resource_type, resource_id)
    DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_ownership_id;

    RETURN v_ownership_id;
END;
$$ LANGUAGE plpgsql;

-- Function to transfer resource ownership
CREATE OR REPLACE FUNCTION transfer_resource_ownership(
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_from_owner_id UUID,
    p_to_owner_id UUID,
    p_transferred_by UUID,
    p_reason TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_transfer_id UUID;
    v_current_owner UUID;
BEGIN
    -- Verify current owner
    SELECT owner_id INTO v_current_owner
    FROM resource_ownership
    WHERE resource_type = p_resource_type
    AND resource_id = p_resource_id;

    IF v_current_owner IS NULL THEN
        RAISE EXCEPTION 'Resource ownership not found';
    END IF;

    IF v_current_owner != p_from_owner_id THEN
        RAISE EXCEPTION 'Ownership mismatch: current owner is different';
    END IF;

    -- Record transfer
    INSERT INTO ownership_transfers (
        resource_type,
        resource_id,
        from_owner_id,
        to_owner_id,
        transferred_by,
        reason,
        metadata
    ) VALUES (
        p_resource_type,
        p_resource_id,
        p_from_owner_id,
        p_to_owner_id,
        p_transferred_by,
        p_reason,
        p_metadata
    )
    RETURNING id INTO v_transfer_id;

    -- Update ownership
    UPDATE resource_ownership
    SET owner_id = p_to_owner_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE resource_type = p_resource_type
    AND resource_id = p_resource_id;

    RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to share resource with user
CREATE OR REPLACE FUNCTION share_resource_with_user(
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_owner_id UUID,
    p_shared_with_user_id UUID,
    p_permission_level VARCHAR,
    p_shared_by UUID,
    p_expires_at TIMESTAMP DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_share_id UUID;
BEGIN
    -- Verify owner
    IF NOT user_owns_resource(p_owner_id, p_resource_type, p_resource_id) THEN
        RAISE EXCEPTION 'Only resource owner can share';
    END IF;

    -- Create or update share
    INSERT INTO shared_resource_access (
        resource_type,
        resource_id,
        owner_id,
        shared_with_user_id,
        permission_level,
        shared_by,
        expires_at
    ) VALUES (
        p_resource_type,
        p_resource_id,
        p_owner_id,
        p_shared_with_user_id,
        p_permission_level,
        p_shared_by,
        p_expires_at
    )
    ON CONFLICT (resource_type, resource_id, shared_with_user_id)
    WHERE shared_with_user_id IS NOT NULL
    DO UPDATE SET
        permission_level = EXCLUDED.permission_level,
        expires_at = EXCLUDED.expires_at
    RETURNING id INTO v_share_id;

    RETURN v_share_id;
END;
$$ LANGUAGE plpgsql;

-- Function to share resource with role
CREATE OR REPLACE FUNCTION share_resource_with_role(
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_owner_id UUID,
    p_shared_with_role_id UUID,
    p_permission_level VARCHAR,
    p_shared_by UUID,
    p_expires_at TIMESTAMP DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_share_id UUID;
BEGIN
    -- Verify owner
    IF NOT user_owns_resource(p_owner_id, p_resource_type, p_resource_id) THEN
        RAISE EXCEPTION 'Only resource owner can share';
    END IF;

    -- Create or update share
    INSERT INTO shared_resource_access (
        resource_type,
        resource_id,
        owner_id,
        shared_with_role_id,
        permission_level,
        shared_by,
        expires_at
    ) VALUES (
        p_resource_type,
        p_resource_id,
        p_owner_id,
        p_shared_with_role_id,
        p_permission_level,
        p_shared_by,
        p_expires_at
    )
    ON CONFLICT (resource_type, resource_id, shared_with_role_id)
    WHERE shared_with_role_id IS NOT NULL
    DO UPDATE SET
        permission_level = EXCLUDED.permission_level,
        expires_at = EXCLUDED.expires_at
    RETURNING id INTO v_share_id;

    RETURN v_share_id;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke resource access
CREATE OR REPLACE FUNCTION revoke_resource_access(
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_owner_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_role_id UUID DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Verify owner
    IF NOT user_owns_resource(p_owner_id, p_resource_type, p_resource_id) THEN
        RAISE EXCEPTION 'Only resource owner can revoke access';
    END IF;

    IF p_user_id IS NOT NULL THEN
        DELETE FROM shared_resource_access
        WHERE resource_type = p_resource_type
        AND resource_id = p_resource_id
        AND shared_with_user_id = p_user_id;
    ELSIF p_role_id IS NOT NULL THEN
        DELETE FROM shared_resource_access
        WHERE resource_type = p_resource_type
        AND resource_id = p_resource_id
        AND shared_with_role_id = p_role_id;
    ELSE
        RAISE EXCEPTION 'Must specify either user_id or role_id';
    END IF;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get resource owner
CREATE OR REPLACE FUNCTION get_resource_owner(
    p_resource_type VARCHAR,
    p_resource_id UUID
) RETURNS TABLE(
    owner_id UUID,
    owner_username VARCHAR,
    owner_email VARCHAR,
    owned_since TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ro.owner_id,
        u.username,
        u.email,
        ro.created_at
    FROM resource_ownership ro
    INNER JOIN users u ON ro.owner_id = u.id
    WHERE ro.resource_type = p_resource_type
    AND ro.resource_id = p_resource_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's owned resources
CREATE OR REPLACE FUNCTION get_user_owned_resources(
    p_user_id UUID,
    p_resource_type VARCHAR DEFAULT NULL
) RETURNS TABLE(
    resource_type VARCHAR,
    resource_id UUID,
    created_at TIMESTAMP,
    share_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ro.resource_type,
        ro.resource_id,
        ro.created_at,
        (SELECT COUNT(*)::INTEGER FROM shared_resource_access
         WHERE resource_type = ro.resource_type
         AND resource_id = ro.resource_id
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)) as share_count
    FROM resource_ownership ro
    WHERE ro.owner_id = p_user_id
    AND (p_resource_type IS NULL OR ro.resource_type = p_resource_type)
    ORDER BY ro.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get resources shared with user
CREATE OR REPLACE FUNCTION get_shared_with_user(
    p_user_id UUID,
    p_resource_type VARCHAR DEFAULT NULL
) RETURNS TABLE(
    resource_type VARCHAR,
    resource_id UUID,
    owner_id UUID,
    owner_username VARCHAR,
    permission_level VARCHAR,
    shared_at TIMESTAMP,
    expires_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        sra.resource_type,
        sra.resource_id,
        sra.owner_id,
        u.username as owner_username,
        sra.permission_level,
        sra.created_at as shared_at,
        sra.expires_at
    FROM shared_resource_access sra
    INNER JOIN users u ON sra.owner_id = u.id
    WHERE (
        sra.shared_with_user_id = p_user_id
        OR sra.shared_with_role_id IN (
            SELECT role_id FROM user_roles
            WHERE user_id = p_user_id
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        )
    )
    AND (sra.expires_at IS NULL OR sra.expires_at > CURRENT_TIMESTAMP)
    AND (p_resource_type IS NULL OR sra.resource_type = p_resource_type)
    ORDER BY sra.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired shares
CREATE OR REPLACE FUNCTION cleanup_expired_shares() RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM shared_resource_access
    WHERE expires_at IS NOT NULL
    AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- View for ownership statistics
CREATE OR REPLACE VIEW ownership_statistics AS
SELECT
    ro.resource_type,
    COUNT(DISTINCT ro.resource_id) as total_resources,
    COUNT(DISTINCT ro.owner_id) as total_owners,
    COUNT(DISTINCT sra.id) FILTER (WHERE sra.expires_at IS NULL OR sra.expires_at > CURRENT_TIMESTAMP) as active_shares,
    COUNT(DISTINCT ot.id) as total_transfers
FROM resource_ownership ro
LEFT JOIN shared_resource_access sra ON ro.resource_type = sra.resource_type AND ro.resource_id = sra.resource_id
LEFT JOIN ownership_transfers ot ON ro.resource_type = ot.resource_type AND ro.resource_id = ot.resource_id
GROUP BY ro.resource_type;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_resource_ownership_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_resource_ownership_timestamp
    BEFORE UPDATE ON resource_ownership
    FOR EACH ROW
    EXECUTE FUNCTION update_resource_ownership_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON resource_ownership TO website_cloner_app;
GRANT SELECT, INSERT ON ownership_transfers TO website_cloner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_resource_access TO website_cloner_app;
GRANT SELECT ON ownership_statistics TO website_cloner_app;

-- Comments
COMMENT ON TABLE resource_ownership IS 'Tracks ownership of resources across the system';
COMMENT ON TABLE ownership_transfers IS 'History of resource ownership transfers';
COMMENT ON TABLE shared_resource_access IS 'Shared access to resources for users and roles';
COMMENT ON FUNCTION user_owns_resource IS 'Check if a user owns a specific resource';
COMMENT ON FUNCTION user_has_resource_access IS 'Check if user has access to resource (owner or shared)';
COMMENT ON FUNCTION transfer_resource_ownership IS 'Transfer resource ownership with history tracking';
COMMENT ON FUNCTION share_resource_with_user IS 'Share resource access with specific user';
COMMENT ON FUNCTION share_resource_with_role IS 'Share resource access with role members';
COMMENT ON VIEW ownership_statistics IS 'Statistics on resource ownership and sharing';
