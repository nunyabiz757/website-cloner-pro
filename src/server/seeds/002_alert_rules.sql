-- Seed: Default Alert Rules
-- Description: Creates default security and monitoring alert rules

-- Insert default alert rules
INSERT INTO alert_rules (name, description, condition, severity, cooldown_minutes, is_active) VALUES
  (
    'Multiple Failed Login Attempts',
    'Alert when a user has multiple failed login attempts within a short time',
    '{
      "type": "threshold",
      "metric": "failed_login_attempts",
      "threshold": 5,
      "window_minutes": 15
    }'::jsonb,
    'high',
    30,
    true
  ),
  (
    'Suspicious IP Activity',
    'Alert when activity is detected from a suspicious or blacklisted IP',
    '{
      "type": "blacklist",
      "resource": "ip_address",
      "action": "login_attempt"
    }'::jsonb,
    'critical',
    60,
    true
  ),
  (
    'High Volume API Requests',
    'Alert when API request rate exceeds normal thresholds',
    '{
      "type": "threshold",
      "metric": "api_requests",
      "threshold": 1000,
      "window_minutes": 5
    }'::jsonb,
    'medium',
    15,
    true
  ),
  (
    'Database Connection Pool Exhaustion',
    'Alert when database connection pool is nearly exhausted',
    '{
      "type": "threshold",
      "metric": "db_connections_used_percent",
      "threshold": 90
    }'::jsonb,
    'high',
    10,
    true
  ),
  (
    'Unauthorized Access Attempt',
    'Alert when unauthorized access to protected resources is attempted',
    '{
      "type": "event",
      "event": "unauthorized_access",
      "resource": "protected_route"
    }'::jsonb,
    'high',
    30,
    true
  ),
  (
    'CSP Violation Detected',
    'Alert when Content Security Policy violations are detected',
    '{
      "type": "threshold",
      "metric": "csp_violations",
      "threshold": 10,
      "window_minutes": 30
    }'::jsonb,
    'medium',
    60,
    true
  ),
  (
    'Password Breach Detected',
    'Alert when a user attempts to use a compromised password',
    '{
      "type": "event",
      "event": "password_breach",
      "action": "registration_or_change"
    }'::jsonb,
    'critical',
    0,
    true
  ),
  (
    'Session Hijacking Attempt',
    'Alert when potential session hijacking is detected',
    '{
      "type": "event",
      "event": "session_anomaly",
      "indicators": ["ip_change", "user_agent_change"]
    }'::jsonb,
    'critical',
    5,
    true
  ),
  (
    'Key Rotation Failed',
    'Alert when encryption key rotation fails',
    '{
      "type": "event",
      "event": "key_rotation_failed"
    }'::jsonb,
    'critical',
    0,
    true
  ),
  (
    'Disk Space Low',
    'Alert when server disk space is running low',
    '{
      "type": "threshold",
      "metric": "disk_usage_percent",
      "threshold": 85
    }'::jsonb,
    'high',
    120,
    true
  ),
  (
    'Memory Usage High',
    'Alert when server memory usage is high',
    '{
      "type": "threshold",
      "metric": "memory_usage_percent",
      "threshold": 90
    }'::jsonb,
    'medium',
    30,
    true
  ),
  (
    'Malware Detection',
    'Alert when malware is detected in uploaded files',
    '{
      "type": "event",
      "event": "malware_detected",
      "scanner": "clamav"
    }'::jsonb,
    'critical',
    0,
    true
  ),
  (
    'Brute Force Attack',
    'Alert when brute force attack pattern is detected',
    '{
      "type": "pattern",
      "pattern": "brute_force",
      "indicators": ["rapid_requests", "multiple_failures"]
    }'::jsonb,
    'critical',
    15,
    true
  ),
  (
    'SQL Injection Attempt',
    'Alert when SQL injection attempt is detected',
    '{
      "type": "pattern",
      "pattern": "sql_injection",
      "resource": "query_parameter"
    }'::jsonb,
    'critical',
    5,
    true
  ),
  (
    'XSS Attack Attempt',
    'Alert when cross-site scripting attempt is detected',
    '{
      "type": "pattern",
      "pattern": "xss_attack",
      "resource": "user_input"
    }'::jsonb,
    'high',
    15,
    true
  )
ON CONFLICT DO NOTHING;
