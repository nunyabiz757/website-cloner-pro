-- Rollback migration for Template Marketplace (Phase 3)
-- This will completely remove all template marketplace features

-- Drop triggers first
DROP TRIGGER IF EXISTS update_template_rating_trigger ON template_reviews;
DROP TRIGGER IF EXISTS increment_tag_usage_trigger ON template_tag_mappings;
DROP TRIGGER IF EXISTS decrement_tag_usage_trigger ON template_tag_mappings;

-- Drop functions
DROP FUNCTION IF EXISTS update_template_rating();
DROP FUNCTION IF EXISTS increment_tag_usage();
DROP FUNCTION IF EXISTS decrement_tag_usage();
DROP FUNCTION IF EXISTS track_template_usage(UUID, UUID, VARCHAR);
DROP FUNCTION IF EXISTS get_template_recommendations(UUID, INTEGER);
DROP FUNCTION IF EXISTS search_templates(TEXT, UUID, INTEGER, INTEGER);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS template_collection_items CASCADE;
DROP TABLE IF EXISTS template_collections CASCADE;
DROP TABLE IF EXISTS template_favorites CASCADE;
DROP TABLE IF EXISTS template_usage CASCADE;
DROP TABLE IF EXISTS template_review_helpful CASCADE;
DROP TABLE IF EXISTS template_reviews CASCADE;
DROP TABLE IF EXISTS template_tag_mappings CASCADE;
DROP TABLE IF EXISTS template_tags CASCADE;
DROP TABLE IF EXISTS template_categories CASCADE;

-- Remove columns added to ghl_clone_templates
ALTER TABLE ghl_clone_templates
    DROP COLUMN IF EXISTS category_id,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS thumbnail_url,
    DROP COLUMN IF EXISTS preview_url,
    DROP COLUMN IF EXISTS is_public,
    DROP COLUMN IF EXISTS is_featured,
    DROP COLUMN IF EXISTS is_verified,
    DROP COLUMN IF EXISTS price_credits,
    DROP COLUMN IF EXISTS rating_average,
    DROP COLUMN IF EXISTS rating_count,
    DROP COLUMN IF EXISTS view_count,
    DROP COLUMN IF EXISTS download_count,
    DROP COLUMN IF EXISTS use_count,
    DROP COLUMN IF EXISTS favorite_count;

-- Note: This rollback removes all marketplace data
-- Make sure to backup before running if you need to preserve any data
