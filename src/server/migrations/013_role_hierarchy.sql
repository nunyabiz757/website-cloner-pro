-- Migration: Role Hierarchy and Permission Inheritance
-- Description: Add role hierarchy support with parent-child relationships and permission inheritance
-- Created: 2025-01-15

-- Add hierarchy fields to roles table
ALTER TABLE roles ADD COLUMN IF NOT EXISTS parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS inherit_permissions BOOLEAN DEFAULT TRUE;

-- Create role hierarchy table for managing inheritance chains
CREATE TABLE IF NOT EXISTS role_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    ancestor_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    depth INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_role_ancestor UNIQUE (role_id, ancestor_id),
    CONSTRAINT no_self_reference CHECK (role_id != ancestor_id),
    CONSTRAINT valid_depth CHECK (depth > 0)
);

-- Create indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_roles_hierarchy_level ON roles(hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_role ON role_hierarchy(role_id);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_ancestor ON role_hierarchy(ancestor_id);
CREATE INDEX IF NOT EXISTS idx_role_hierarchy_depth ON role_hierarchy(depth);

-- Function to get all ancestor roles for a given role
CREATE OR REPLACE FUNCTION get_role_ancestors(p_role_id UUID)
RETURNS TABLE(
    role_id UUID,
    role_name VARCHAR,
    depth INTEGER,
    inherit_permissions BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE ancestors AS (
        -- Base case: the role itself
        SELECT
            r.id,
            r.name,
            0 as depth,
            r.inherit_permissions
        FROM roles r
        WHERE r.id = p_role_id

        UNION ALL

        -- Recursive case: parent roles
        SELECT
            r.id,
            r.name,
            a.depth + 1,
            r.inherit_permissions
        FROM roles r
        INNER JOIN ancestors a ON r.id = (
            SELECT parent_role_id
            FROM roles
            WHERE id = a.role_id
        )
        WHERE r.id IS NOT NULL
        AND a.depth < 10 -- Prevent infinite loops
    )
    SELECT
        a.id,
        a.name,
        a.depth,
        a.inherit_permissions
    FROM ancestors a
    WHERE a.depth > 0 -- Exclude the role itself
    ORDER BY a.depth;
END;
$$ LANGUAGE plpgsql;

-- Function to get all descendant roles for a given role
CREATE OR REPLACE FUNCTION get_role_descendants(p_role_id UUID)
RETURNS TABLE(
    role_id UUID,
    role_name VARCHAR,
    depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        -- Base case: the role itself
        SELECT
            r.id,
            r.name,
            0 as depth
        FROM roles r
        WHERE r.id = p_role_id

        UNION ALL

        -- Recursive case: child roles
        SELECT
            r.id,
            r.name,
            d.depth + 1
        FROM roles r
        INNER JOIN descendants d ON r.parent_role_id = d.role_id
        WHERE d.depth < 10 -- Prevent infinite loops
    )
    SELECT
        d.id,
        d.name,
        d.depth
    FROM descendants d
    WHERE d.depth > 0 -- Exclude the role itself
    ORDER BY d.depth;
END;
$$ LANGUAGE plpgsql;

-- Function to get all inherited permissions for a role
CREATE OR REPLACE FUNCTION get_inherited_permissions(p_role_id UUID)
RETURNS TABLE(
    permission_id UUID,
    permission_name VARCHAR,
    resource VARCHAR,
    action VARCHAR,
    source_role_id UUID,
    source_role_name VARCHAR,
    inheritance_depth INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE role_chain AS (
        -- Base case: the role itself
        SELECT
            r.id as role_id,
            r.name as role_name,
            r.parent_role_id,
            r.inherit_permissions,
            0 as depth
        FROM roles r
        WHERE r.id = p_role_id

        UNION ALL

        -- Recursive case: parent roles
        SELECT
            r.id,
            r.name,
            r.parent_role_id,
            r.inherit_permissions,
            rc.depth + 1
        FROM roles r
        INNER JOIN role_chain rc ON r.id = rc.parent_role_id
        WHERE rc.inherit_permissions = TRUE
        AND rc.depth < 10 -- Prevent infinite loops
    )
    SELECT DISTINCT
        p.id as permission_id,
        p.name as permission_name,
        p.resource,
        p.action,
        rc.role_id as source_role_id,
        rc.role_name as source_role_name,
        rc.depth as inheritance_depth
    FROM role_chain rc
    INNER JOIN role_permissions rp ON rp.role_id = rc.role_id
    INNER JOIN permissions p ON p.id = rp.permission_id
    ORDER BY rc.depth, p.resource, p.action;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a user has permission (including inherited)
CREATE OR REPLACE FUNCTION user_has_inherited_permission(
    p_user_id UUID,
    p_resource VARCHAR,
    p_action VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN;
BEGIN
    -- Check if user has the permission through any role (direct or inherited)
    SELECT EXISTS(
        SELECT 1
        FROM user_roles ur
        INNER JOIN get_inherited_permissions(ur.role_id) ip
            ON TRUE
        WHERE ur.user_id = p_user_id
        AND ip.resource = p_resource
        AND ip.action = p_action
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql;

-- Function to rebuild role hierarchy table
CREATE OR REPLACE FUNCTION rebuild_role_hierarchy() RETURNS INTEGER AS $$
DECLARE
    v_role RECORD;
    v_ancestor RECORD;
    v_inserted_count INTEGER := 0;
BEGIN
    -- Clear existing hierarchy
    DELETE FROM role_hierarchy;

    -- Build hierarchy for each role
    FOR v_role IN SELECT id FROM roles LOOP
        -- Insert all ancestors
        FOR v_ancestor IN
            SELECT role_id, depth
            FROM get_role_ancestors(v_role.id)
        LOOP
            INSERT INTO role_hierarchy (role_id, ancestor_id, depth)
            VALUES (v_role.id, v_ancestor.role_id, v_ancestor.depth);
            v_inserted_count := v_inserted_count + 1;
        END LOOP;
    END LOOP;

    RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update hierarchy level for a role and its descendants
CREATE OR REPLACE FUNCTION update_hierarchy_levels(p_role_id UUID) RETURNS VOID AS $$
DECLARE
    v_parent_level INTEGER;
    v_new_level INTEGER;
BEGIN
    -- Get parent's hierarchy level
    SELECT COALESCE(hierarchy_level, -1) INTO v_parent_level
    FROM roles
    WHERE id = (SELECT parent_role_id FROM roles WHERE id = p_role_id);

    -- Calculate new level
    v_new_level := v_parent_level + 1;

    -- Update the role's level
    UPDATE roles
    SET hierarchy_level = v_new_level
    WHERE id = p_role_id;

    -- Update all descendants recursively
    WITH RECURSIVE descendants AS (
        SELECT id, parent_role_id, hierarchy_level
        FROM roles
        WHERE parent_role_id = p_role_id

        UNION ALL

        SELECT r.id, r.parent_role_id, r.hierarchy_level
        FROM roles r
        INNER JOIN descendants d ON r.parent_role_id = d.id
    )
    UPDATE roles r
    SET hierarchy_level = (
        SELECT COUNT(*)
        FROM get_role_ancestors(r.id)
    )
    FROM descendants d
    WHERE r.id = d.id;
END;
$$ LANGUAGE plpgsql;

-- Function to validate role hierarchy (prevent cycles)
CREATE OR REPLACE FUNCTION validate_role_hierarchy(
    p_role_id UUID,
    p_parent_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_valid BOOLEAN := TRUE;
BEGIN
    -- Cannot set parent to self
    IF p_role_id = p_parent_id THEN
        RETURN FALSE;
    END IF;

    -- Cannot set parent to a descendant (would create cycle)
    IF EXISTS(
        SELECT 1
        FROM get_role_descendants(p_role_id)
        WHERE role_id = p_parent_id
    ) THEN
        RETURN FALSE;
    END IF;

    -- Check for maximum depth
    IF (
        SELECT COUNT(*)
        FROM get_role_ancestors(p_parent_id)
    ) >= 9 THEN
        RETURN FALSE; -- Max depth would exceed 10
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to set role parent with validation
CREATE OR REPLACE FUNCTION set_role_parent(
    p_role_id UUID,
    p_parent_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_valid BOOLEAN;
BEGIN
    -- Validate the hierarchy change
    v_is_valid := validate_role_hierarchy(p_role_id, p_parent_id);

    IF NOT v_is_valid THEN
        RAISE EXCEPTION 'Invalid role hierarchy: would create cycle or exceed max depth';
    END IF;

    -- Update the parent
    UPDATE roles
    SET parent_role_id = p_parent_id
    WHERE id = p_role_id;

    -- Update hierarchy levels
    PERFORM update_hierarchy_levels(p_role_id);

    -- Rebuild hierarchy table
    PERFORM rebuild_role_hierarchy();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get role hierarchy tree
CREATE OR REPLACE FUNCTION get_role_hierarchy_tree()
RETURNS TABLE(
    role_id UUID,
    role_name VARCHAR,
    role_description TEXT,
    parent_id UUID,
    hierarchy_level INTEGER,
    inherit_permissions BOOLEAN,
    permission_count INTEGER,
    inherited_permission_count INTEGER,
    child_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.name,
        r.description,
        r.parent_role_id,
        r.hierarchy_level,
        r.inherit_permissions,
        (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id)::INTEGER,
        (SELECT COUNT(DISTINCT permission_id) FROM get_inherited_permissions(r.id) WHERE inheritance_depth > 0)::INTEGER,
        (SELECT COUNT(*) FROM roles WHERE parent_role_id = r.id)::INTEGER
    FROM roles r
    ORDER BY r.hierarchy_level, r.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get effective permissions for a user (including inherited)
CREATE OR REPLACE FUNCTION get_user_effective_permissions(p_user_id UUID)
RETURNS TABLE(
    permission_id UUID,
    permission_name VARCHAR,
    resource VARCHAR,
    action VARCHAR,
    source_type VARCHAR, -- 'direct' or 'inherited'
    source_role_id UUID,
    source_role_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        p.id,
        p.name,
        p.resource,
        p.action,
        CASE
            WHEN rp.role_id = ur.role_id THEN 'direct'
            ELSE 'inherited'
        END as source_type,
        rp.role_id,
        r.name
    FROM user_roles ur
    CROSS JOIN LATERAL get_inherited_permissions(ur.role_id) ip
    INNER JOIN permissions p ON p.id = ip.permission_id
    INNER JOIN role_permissions rp ON rp.permission_id = p.id
    INNER JOIN roles r ON r.id = rp.role_id
    WHERE ur.user_id = p_user_id
    ORDER BY p.resource, p.action;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update hierarchy on parent change
CREATE OR REPLACE FUNCTION trigger_update_role_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.parent_role_id IS DISTINCT FROM NEW.parent_role_id) OR
       (TG_OP = 'INSERT' AND NEW.parent_role_id IS NOT NULL) THEN
        -- Update hierarchy levels
        PERFORM update_hierarchy_levels(NEW.id);
        -- Rebuild hierarchy table
        PERFORM rebuild_role_hierarchy();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_role_hierarchy_update
    AFTER INSERT OR UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_role_hierarchy();

-- View for role hierarchy visualization
CREATE OR REPLACE VIEW role_hierarchy_view AS
SELECT
    r.id,
    r.name,
    r.description,
    r.parent_role_id,
    pr.name as parent_role_name,
    r.hierarchy_level,
    r.inherit_permissions,
    (SELECT COUNT(*) FROM role_permissions WHERE role_id = r.id) as direct_permission_count,
    (SELECT COUNT(DISTINCT permission_id) FROM get_inherited_permissions(r.id) WHERE inheritance_depth > 0) as inherited_permission_count,
    (SELECT COUNT(*) FROM roles WHERE parent_role_id = r.id) as child_count,
    (SELECT json_agg(json_build_object('id', id, 'name', name))
     FROM roles WHERE parent_role_id = r.id) as children,
    r.created_at,
    r.updated_at
FROM roles r
LEFT JOIN roles pr ON r.parent_role_id = pr.id;

-- Insert default role hierarchy
-- Admin (no parent)
-- ├── Manager (inherits from Admin)
-- │   ├── Supervisor (inherits from Manager)
-- │   └── Team Lead (inherits from Manager)
-- └── Developer (inherits from Admin)
--     └── Junior Developer (inherits from Developer)
-- User (no parent)
-- └── Guest (inherits from User)

DO $$
DECLARE
    v_admin_id UUID;
    v_manager_id UUID;
    v_developer_id UUID;
    v_user_id UUID;
BEGIN
    -- Get existing role IDs
    SELECT id INTO v_admin_id FROM roles WHERE name = 'admin' LIMIT 1;
    SELECT id INTO v_manager_id FROM roles WHERE name = 'manager' LIMIT 1;
    SELECT id INTO v_developer_id FROM roles WHERE name = 'developer' LIMIT 1;
    SELECT id INTO v_user_id FROM roles WHERE name = 'user' LIMIT 1;

    -- Set up hierarchy if roles exist
    IF v_admin_id IS NOT NULL AND v_manager_id IS NOT NULL THEN
        UPDATE roles SET parent_role_id = v_admin_id, hierarchy_level = 1 WHERE id = v_manager_id;
    END IF;

    IF v_admin_id IS NOT NULL AND v_developer_id IS NOT NULL THEN
        UPDATE roles SET parent_role_id = v_admin_id, hierarchy_level = 1 WHERE id = v_developer_id;
    END IF;

    -- Create additional hierarchical roles
    INSERT INTO roles (name, description, parent_role_id, hierarchy_level, inherit_permissions)
    VALUES
        ('supervisor', 'Supervisor role with inherited manager permissions', v_manager_id, 2, TRUE),
        ('team_lead', 'Team lead with inherited manager permissions', v_manager_id, 2, TRUE),
        ('junior_developer', 'Junior developer with inherited developer permissions', v_developer_id, 2, TRUE),
        ('guest', 'Guest with limited inherited user permissions', v_user_id, 1, TRUE)
    ON CONFLICT (name) DO NOTHING;

    -- Rebuild hierarchy table
    PERFORM rebuild_role_hierarchy();
END $$;

-- Grant permissions
GRANT SELECT ON role_hierarchy TO website_cloner_app;
GRANT SELECT ON role_hierarchy_view TO website_cloner_app;

-- Comments
COMMENT ON TABLE role_hierarchy IS 'Materialized role hierarchy for efficient permission inheritance queries';
COMMENT ON COLUMN roles.parent_role_id IS 'Parent role from which permissions are inherited';
COMMENT ON COLUMN roles.hierarchy_level IS 'Depth in role hierarchy (0 = root)';
COMMENT ON COLUMN roles.inherit_permissions IS 'Whether this role inherits permissions from parent';
COMMENT ON FUNCTION get_role_ancestors IS 'Get all ancestor roles in the hierarchy';
COMMENT ON FUNCTION get_role_descendants IS 'Get all descendant roles in the hierarchy';
COMMENT ON FUNCTION get_inherited_permissions IS 'Get all permissions inherited from parent roles';
COMMENT ON FUNCTION user_has_inherited_permission IS 'Check if user has permission through role inheritance';
COMMENT ON FUNCTION rebuild_role_hierarchy IS 'Rebuild the role hierarchy materialized table';
COMMENT ON FUNCTION validate_role_hierarchy IS 'Validate role parent assignment to prevent cycles';
COMMENT ON FUNCTION set_role_parent IS 'Set role parent with validation and hierarchy update';
COMMENT ON VIEW role_hierarchy_view IS 'Denormalized view of role hierarchy with statistics';
