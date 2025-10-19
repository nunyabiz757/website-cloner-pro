import { Pool } from 'pg';
import {
  EnhancedAuditService,
  initializeEnhancedAuditService,
  AdvancedAuditFilters,
  AuditStatistics,
  SuspiciousActivity,
} from '../services/audit-enhanced.service';

describe('EnhancedAuditService', () => {
  let pool: Pool;
  let auditService: EnhancedAuditService;

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockUsername = 'test_user';
  const mockAuditLogId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    pool = {
      query: jest.fn(),
    } as any;

    auditService = initializeEnhancedAuditService(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Advanced Search', () => {
    it('should perform advanced search with all filters', async () => {
      const mockLogs = [
        {
          id: mockAuditLogId,
          user_id: mockUserId,
          username: mockUsername,
          action: 'user.login',
          resource_type: 'user',
          resource_id: mockUserId,
          status: 'success',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          details: {},
          metadata: {},
          timestamp: new Date(),
          relevance_score: 1.0,
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockLogs }) // Search results
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // Count

      const filters: AdvancedAuditFilters = {
        searchQuery: 'login',
        userId: mockUserId,
        action: 'user.login',
        status: 'success',
        limit: 100,
        offset: 0,
      };

      const result = await auditService.advancedSearch(filters);

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.logs[0].action).toBe('user.login');
    });

    it('should handle empty search results', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const result = await auditService.advancedSearch({});

      expect(result.logs).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should search with date range', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const filters: AdvancedAuditFilters = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      };

      await auditService.advancedSearch(filters);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([filters.startDate, filters.endDate])
      );
    });

    it('should handle search errors', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      await expect(auditService.advancedSearch({})).rejects.toThrow('Advanced search failed');
    });
  });

  describe('Statistics', () => {
    it('should get comprehensive statistics', async () => {
      const mockStats = {
        total_logs: 1000,
        unique_users: 50,
        unique_actions: 25,
        success_count: 900,
        failure_count: 80,
        warning_count: 20,
        most_common_action: 'user.login',
        most_active_user: mockUserId,
        most_active_ip: '192.168.1.1',
        logs_by_hour: { '0': 10, '1': 5 },
        logs_by_day: { '2025-01-15': 100 },
        logs_by_action: { 'user.login': 500 },
        logs_by_status: { 'success': 900 },
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockStats] });

      const result = await auditService.getStatistics();

      expect(result.totalLogs).toBe(1000);
      expect(result.uniqueUsers).toBe(50);
      expect(result.mostCommonAction).toBe('user.login');
      expect(result.logsByAction).toHaveProperty('user.login');
    });

    it('should get statistics with date range', async () => {
      const mockStats = {
        total_logs: 100,
        unique_users: 10,
        unique_actions: 5,
        success_count: 90,
        failure_count: 10,
        warning_count: 0,
        logs_by_hour: {},
        logs_by_day: {},
        logs_by_action: {},
        logs_by_status: {},
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockStats] });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await auditService.getStatistics(startDate, endDate);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_audit_log_statistics($1, $2)',
        [startDate, endDate]
      );
    });

    it('should handle empty statistics', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(auditService.getStatistics()).rejects.toThrow('No statistics available');
    });
  });

  describe('User Timeline', () => {
    it('should get user activity timeline', async () => {
      const mockTimeline = [
        {
          id: mockAuditLogId,
          action: 'user.login',
          resource_type: 'user',
          resource_id: mockUserId,
          status: 'success',
          timestamp: new Date(),
          details: {},
          time_since_previous: '00:05:00',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockTimeline });

      const result = await auditService.getUserTimeline(mockUserId, 100);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('user.login');
    });

    it('should respect limit parameter', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await auditService.getUserTimeline(mockUserId, 50);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_user_audit_timeline($1, $2)',
        [mockUserId, 50]
      );
    });
  });

  describe('Resource History', () => {
    it('should get resource audit history', async () => {
      const mockHistory = [
        {
          id: mockAuditLogId,
          user_id: mockUserId,
          username: mockUsername,
          action: 'resource.update',
          status: 'success',
          timestamp: new Date(),
          details: {},
          ip_address: '192.168.1.1',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockHistory });

      const result = await auditService.getResourceHistory('website', mockUserId, 100);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('resource.update');
    });

    it('should handle non-existent resource', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await auditService.getResourceHistory('website', 'non-existent', 100);

      expect(result).toHaveLength(0);
    });
  });

  describe('Logs by IP', () => {
    it('should get logs by IP address', async () => {
      const mockLogs = [
        {
          id: mockAuditLogId,
          user_id: mockUserId,
          username: mockUsername,
          action: 'user.login',
          resource_type: 'user',
          status: 'success',
          timestamp: new Date(),
          user_agent: 'Mozilla/5.0',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockLogs });

      const result = await auditService.getLogsByIp('192.168.1.1', 100);

      expect(result).toHaveLength(1);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_audit_logs_by_ip($1, $2)',
        ['192.168.1.1', 100]
      );
    });
  });

  describe('Failed Actions', () => {
    it('should get failed actions', async () => {
      const mockFailed = [
        {
          id: mockAuditLogId,
          user_id: mockUserId,
          username: mockUsername,
          action: 'user.login',
          resource_type: 'user',
          resource_id: mockUserId,
          timestamp: new Date(),
          details: { error: 'Invalid password' },
          ip_address: '192.168.1.1',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockFailed });

      const result = await auditService.getFailedActions();

      expect(result).toHaveLength(1);
      expect(result[0].details).toHaveProperty('error');
    });

    it('should filter failed actions by date', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await auditService.getFailedActions(startDate, endDate, 100);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_failed_actions($1, $2, $3)',
        [startDate, endDate, 100]
      );
    });
  });

  describe('Suspicious Activities', () => {
    it('should detect suspicious activities', async () => {
      const mockActivities = [
        {
          pattern_type: 'multiple_failed_logins',
          user_id: mockUserId,
          username: mockUsername,
          ip_address: '192.168.1.1',
          activity_count: 10,
          first_seen: new Date(),
          last_seen: new Date(),
          sample_actions: ['user.login', 'user.login'],
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockActivities });

      const result = await auditService.getSuspiciousActivities(24, 100);

      expect(result).toHaveLength(1);
      expect(result[0].patternType).toBe('multiple_failed_logins');
      expect(result[0].activityCount).toBe(10);
    });

    it('should return multiple pattern types', async () => {
      const mockActivities = [
        {
          pattern_type: 'multiple_failed_logins',
          activity_count: 5,
          first_seen: new Date(),
          last_seen: new Date(),
          sample_actions: [],
        },
        {
          pattern_type: 'high_volume_requests',
          activity_count: 150,
          first_seen: new Date(),
          last_seen: new Date(),
          sample_actions: [],
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockActivities });

      const result = await auditService.getSuspiciousActivities();

      expect(result).toHaveLength(2);
      expect(result.some((a) => a.patternType === 'multiple_failed_logins')).toBe(true);
      expect(result.some((a) => a.patternType === 'high_volume_requests')).toBe(true);
    });
  });

  describe('Export Functions', () => {
    it('should export to CSV', async () => {
      const mockLogs = [
        {
          id: mockAuditLogId,
          timestamp: new Date(),
          username: mockUsername,
          action: 'user.login',
          resourceType: 'user',
          resourceId: mockUserId,
          status: 'success',
          ipAddress: '192.168.1.1',
          details: {},
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockLogs })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const csv = await auditService.exportToCSV({});

      expect(csv).toContain('timestamp');
      expect(csv).toContain('username');
      expect(csv).toContain('user.login');
    });

    it('should export to JSON', async () => {
      const mockLogs = [
        {
          id: mockAuditLogId,
          timestamp: new Date(),
          username: mockUsername,
          action: 'user.login',
        },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockLogs })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const json = await auditService.exportToJSON({});
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('exportDate');
      expect(parsed).toHaveProperty('logs');
      expect(parsed.logs).toHaveLength(1);
    });

    it('should create export record', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Search for total
        .mockResolvedValueOnce({ rows: [{ count: 100 }] }) // Count
        .mockResolvedValueOnce({
          // Insert export
          rows: [
            {
              id: 'export-id',
              export_name: 'Test Export',
              export_format: 'csv',
              filters: {},
              total_records: 100,
              created_by: mockUserId,
              created_at: new Date(),
              expires_at: new Date(),
              download_count: 0,
            },
          ],
        });

      const result = await auditService.createExport('Test Export', 'csv', {}, mockUserId);

      expect(result.exportName).toBe('Test Export');
      expect(result.totalRecords).toBe(100);
    });
  });

  describe('Saved Searches', () => {
    it('should save a search', async () => {
      const mockSearch = {
        id: 'search-id',
        search_name: 'My Search',
        search_filters: { action: 'user.login' },
        is_public: false,
        created_by: mockUserId,
        created_at: new Date(),
        use_count: 0,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockSearch] });

      const result = await auditService.saveSearch(
        'My Search',
        { action: 'user.login' },
        mockUserId,
        false
      );

      expect(result.searchName).toBe('My Search');
      expect(result.searchFilters).toHaveProperty('action');
    });

    it('should get saved searches', async () => {
      const mockSearches = [
        {
          id: 'search-1',
          search_name: 'Search 1',
          search_filters: {},
          is_public: false,
          created_by: mockUserId,
          created_at: new Date(),
          use_count: 5,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockSearches });

      const result = await auditService.getSavedSearches(mockUserId, true);

      expect(result).toHaveLength(1);
      expect(result[0].searchName).toBe('Search 1');
    });

    it('should use saved search', async () => {
      const mockSearch = {
        id: 'search-id',
        search_name: 'My Search',
        search_filters: {},
        is_public: false,
        created_by: mockUserId,
        created_at: new Date(),
        last_used_at: new Date(),
        use_count: 1,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockSearch] });

      const result = await auditService.useSavedSearch('search-id');

      expect(result.useCount).toBe(1);
      expect(result.lastUsedAt).toBeDefined();
    });

    it('should delete saved search', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

      await expect(auditService.deleteSavedSearch('search-id', mockUserId)).resolves.not.toThrow();
    });

    it('should throw error when deleting non-existent search', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

      await expect(auditService.deleteSavedSearch('search-id', mockUserId)).rejects.toThrow(
        'Saved search not found or unauthorized'
      );
    });
  });

  describe('Bookmarks', () => {
    it('should add bookmark', async () => {
      const mockBookmark = {
        id: 'bookmark-id',
        audit_log_id: mockAuditLogId,
        user_id: mockUserId,
        notes: 'Important log entry',
        created_at: new Date(),
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockBookmark] });

      const result = await auditService.addBookmark(mockAuditLogId, mockUserId, 'Important log entry');

      expect(result.auditLogId).toBe(mockAuditLogId);
      expect(result.notes).toBe('Important log entry');
    });

    it('should get user bookmarks', async () => {
      const mockBookmarks = [
        {
          id: 'bookmark-1',
          audit_log_id: mockAuditLogId,
          notes: 'Note',
          created_at: new Date(),
          action: 'user.login',
          resource_type: 'user',
          timestamp: new Date(),
          username: mockUsername,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: mockBookmarks });

      const result = await auditService.getBookmarks(mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('user.login');
    });

    it('should remove bookmark', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

      await expect(auditService.removeBookmark('bookmark-id', mockUserId)).resolves.not.toThrow();
    });

    it('should throw error when removing non-existent bookmark', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

      await expect(auditService.removeBookmark('bookmark-id', mockUserId)).rejects.toThrow(
        'Bookmark not found or unauthorized'
      );
    });
  });

  describe('Export Management', () => {
    it('should get export by ID', async () => {
      const mockExport = {
        id: 'export-id',
        export_name: 'Test Export',
        export_format: 'csv',
        filters: {},
        total_records: 100,
        created_by: mockUserId,
        created_at: new Date(),
        expires_at: new Date(),
        download_count: 0,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockExport] });

      const result = await auditService.getExport('export-id');

      expect(result).not.toBeNull();
      expect(result?.exportName).toBe('Test Export');
    });

    it('should return null for non-existent export', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await auditService.getExport('non-existent');

      expect(result).toBeNull();
    });

    it('should record export download', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({});

      await expect(auditService.recordExportDownload('export-id')).resolves.not.toThrow();

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE audit_log_exports'),
        ['export-id']
      );
    });

    it('should cleanup old exports', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ cleanup_old_exports: 5 }],
      });

      const result = await auditService.cleanupOldExports();

      expect(result).toBe(5);
    });
  });
});
