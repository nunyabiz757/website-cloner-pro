import { Pool } from 'pg';
import {
  ResourceOwnershipService,
  initializeResourceOwnershipService,
  ResourceOwner,
  OwnedResource,
  SharedResource,
  OwnershipTransfer,
  SharedResourceAccess,
} from '../services/resource-ownership.service';

describe('ResourceOwnershipService', () => {
  let pool: Pool;
  let ownershipService: ResourceOwnershipService;

  const mockUser1 = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'owner1',
    email: 'owner1@example.com',
  };

  const mockUser2 = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'owner2',
    email: 'owner2@example.com',
  };

  const mockUser3 = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'viewer',
    email: 'viewer@example.com',
  };

  const mockRole = {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'editors',
  };

  const mockResource = {
    type: 'website',
    id: '55555555-5555-5555-5555-555555555555',
  };

  beforeEach(() => {
    pool = {
      query: jest.fn(),
    } as any;

    ownershipService = initializeResourceOwnershipService(pool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Ownership Registration', () => {
    it('should register resource ownership', async () => {
      const ownershipId = '66666666-6666-6666-6666-666666666666';
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ ownership_id: ownershipId }],
      });

      const result = await ownershipService.registerOwnership(
        mockResource.type,
        mockResource.id,
        mockUser1.id
      );

      expect(result).toBe(ownershipId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT register_resource_ownership($1, $2, $3, $4) as ownership_id',
        [mockResource.type, mockResource.id, mockUser1.id, undefined]
      );
    });

    it('should register ownership with created_by', async () => {
      const ownershipId = '66666666-6666-6666-6666-666666666666';
      const adminId = '77777777-7777-7777-7777-777777777777';
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ ownership_id: ownershipId }],
      });

      const result = await ownershipService.registerOwnership(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        adminId
      );

      expect(result).toBe(ownershipId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT register_resource_ownership($1, $2, $3, $4) as ownership_id',
        [mockResource.type, mockResource.id, mockUser1.id, adminId]
      );
    });

    it('should handle registration errors', async () => {
      const error = new Error('Database error');
      (pool.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        ownershipService.registerOwnership(
          mockResource.type,
          mockResource.id,
          mockUser1.id
        )
      ).rejects.toThrow('Database error');
    });

    it('should batch register ownership for multiple resources', async () => {
      const resources = [
        { resourceType: 'website', resourceId: 'id1', ownerId: mockUser1.id },
        { resourceType: 'clone', resourceId: 'id2', ownerId: mockUser1.id },
        { resourceType: 'website', resourceId: 'id3', ownerId: mockUser1.id },
      ];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ ownership_id: 'owner1' }] })
        .mockResolvedValueOnce({ rows: [{ ownership_id: 'owner2' }] })
        .mockResolvedValueOnce({ rows: [{ ownership_id: 'owner3' }] });

      const result = await ownershipService.batchRegisterOwnership(resources);

      expect(result).toEqual(['owner1', 'owner2', 'owner3']);
      expect(pool.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('Ownership Verification', () => {
    it('should verify user owns resource', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ owns: true }],
      });

      const result = await ownershipService.userOwnsResource(
        mockUser1.id,
        mockResource.type,
        mockResource.id
      );

      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT user_owns_resource($1, $2, $3) as owns',
        [mockUser1.id, mockResource.type, mockResource.id]
      );
    });

    it('should verify user does not own resource', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ owns: false }],
      });

      const result = await ownershipService.userOwnsResource(
        mockUser2.id,
        mockResource.type,
        mockResource.id
      );

      expect(result).toBe(false);
    });

    it('should handle empty result as false', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await ownershipService.userOwnsResource(
        mockUser2.id,
        mockResource.type,
        mockResource.id
      );

      expect(result).toBe(false);
    });
  });

  describe('Resource Access Verification', () => {
    it('should verify user has read access', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ has_access: true }],
      });

      const result = await ownershipService.userHasResourceAccess(
        mockUser3.id,
        mockResource.type,
        mockResource.id,
        'read'
      );

      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT user_has_resource_access($1, $2, $3, $4) as has_access',
        [mockUser3.id, mockResource.type, mockResource.id, 'read']
      );
    });

    it('should verify user has write access', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ has_access: true }],
      });

      const result = await ownershipService.userHasResourceAccess(
        mockUser3.id,
        mockResource.type,
        mockResource.id,
        'write'
      );

      expect(result).toBe(true);
    });

    it('should verify user has admin access', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ has_access: true }],
      });

      const result = await ownershipService.userHasResourceAccess(
        mockUser3.id,
        mockResource.type,
        mockResource.id,
        'admin'
      );

      expect(result).toBe(true);
    });

    it('should verify user does not have access', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ has_access: false }],
      });

      const result = await ownershipService.userHasResourceAccess(
        mockUser3.id,
        mockResource.type,
        mockResource.id,
        'write'
      );

      expect(result).toBe(false);
    });

    it('should default to read permission level', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ has_access: true }],
      });

      await ownershipService.userHasResourceAccess(
        mockUser3.id,
        mockResource.type,
        mockResource.id
      );

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [mockUser3.id, mockResource.type, mockResource.id, 'read']
      );
    });
  });

  describe('Ownership Transfer', () => {
    it('should transfer ownership', async () => {
      const transferId = '88888888-8888-8888-8888-888888888888';
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ transfer_id: transferId }],
      });

      const result = await ownershipService.transferOwnership(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser2.id,
        mockUser1.id,
        'Transferring to new owner'
      );

      expect(result).toBe(transferId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT transfer_resource_ownership($1, $2, $3, $4, $5, $6, $7) as transfer_id',
        [
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser2.id,
          mockUser1.id,
          'Transferring to new owner',
          null,
        ]
      );
    });

    it('should transfer ownership with metadata', async () => {
      const transferId = '88888888-8888-8888-8888-888888888888';
      const metadata = { reason_code: 'EMPLOYEE_TRANSFER', department: 'IT' };
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ transfer_id: transferId }],
      });

      const result = await ownershipService.transferOwnership(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser2.id,
        mockUser1.id,
        'Employee transfer',
        metadata
      );

      expect(result).toBe(transferId);
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser2.id,
          mockUser1.id,
          'Employee transfer',
          JSON.stringify(metadata),
        ]
      );
    });

    it('should handle transfer errors', async () => {
      const error = new Error('Transfer failed');
      (pool.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        ownershipService.transferOwnership(
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser2.id,
          mockUser1.id
        )
      ).rejects.toThrow('Transfer failed');
    });
  });

  describe('Transfer Validation', () => {
    it('should validate a valid transfer', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              owner_id: mockUser1.id,
              owner_username: mockUser1.username,
              owner_email: mockUser1.email,
              owned_since: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ exists: true }],
        });

      const result = await ownershipService.validateTransfer(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser2.id
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject transfer when resource not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await ownershipService.validateTransfer(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser2.id
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Resource ownership not found');
    });

    it('should reject transfer when owner mismatch', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            owner_id: mockUser2.id,
            owner_username: mockUser2.username,
            owner_email: mockUser2.email,
            owned_since: new Date(),
          },
        ],
      });

      const result = await ownershipService.validateTransfer(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser2.id
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Current owner mismatch');
    });

    it('should reject transfer to same owner', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            owner_id: mockUser1.id,
            owner_username: mockUser1.username,
            owner_email: mockUser1.email,
            owned_since: new Date(),
          },
        ],
      });

      const result = await ownershipService.validateTransfer(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser1.id
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cannot transfer to same owner');
    });

    it('should reject transfer when target user not found', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              owner_id: mockUser1.id,
              owner_username: mockUser1.username,
              owner_email: mockUser1.email,
              owned_since: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ exists: false }],
        });

      const result = await ownershipService.validateTransfer(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser2.id
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Target user not found');
    });
  });

  describe('Shared Access - User', () => {
    it('should share resource with user', async () => {
      const shareId = '99999999-9999-9999-9999-999999999999';
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ share_id: shareId }],
      });

      const result = await ownershipService.shareWithUser(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser3.id,
        'read',
        mockUser1.id
      );

      expect(result).toBe(shareId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT share_resource_with_user($1, $2, $3, $4, $5, $6, $7) as share_id',
        [
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser3.id,
          'read',
          mockUser1.id,
          undefined,
        ]
      );
    });

    it('should share resource with expiration', async () => {
      const shareId = '99999999-9999-9999-9999-999999999999';
      const expiresAt = new Date('2025-12-31');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ share_id: shareId }],
      });

      const result = await ownershipService.shareWithUser(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser3.id,
        'write',
        mockUser1.id,
        expiresAt
      );

      expect(result).toBe(shareId);
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser3.id,
          'write',
          mockUser1.id,
          expiresAt,
        ]
      );
    });

    it('should handle share errors', async () => {
      const error = new Error('Share failed');
      (pool.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        ownershipService.shareWithUser(
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser3.id,
          'read',
          mockUser1.id
        )
      ).rejects.toThrow('Share failed');
    });
  });

  describe('Shared Access - Role', () => {
    it('should share resource with role', async () => {
      const shareId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ share_id: shareId }],
      });

      const result = await ownershipService.shareWithRole(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockRole.id,
        'read',
        mockUser1.id
      );

      expect(result).toBe(shareId);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT share_resource_with_role($1, $2, $3, $4, $5, $6, $7) as share_id',
        [
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockRole.id,
          'read',
          mockUser1.id,
          undefined,
        ]
      );
    });

    it('should share resource with role and expiration', async () => {
      const shareId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const expiresAt = new Date('2025-12-31');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ share_id: shareId }],
      });

      const result = await ownershipService.shareWithRole(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockRole.id,
        'admin',
        mockUser1.id,
        expiresAt
      );

      expect(result).toBe(shareId);
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockRole.id,
          'admin',
          mockUser1.id,
          expiresAt,
        ]
      );
    });

    it('should handle role share errors', async () => {
      const error = new Error('Role share failed');
      (pool.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        ownershipService.shareWithRole(
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockRole.id,
          'read',
          mockUser1.id
        )
      ).rejects.toThrow('Role share failed');
    });
  });

  describe('Access Revocation', () => {
    it('should revoke user access', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ deleted_count: 1 }],
      });

      const result = await ownershipService.revokeAccess(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser3.id
      );

      expect(result).toBe(1);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT revoke_resource_access($1, $2, $3, $4, $5) as deleted_count',
        [mockResource.type, mockResource.id, mockUser1.id, mockUser3.id, undefined]
      );
    });

    it('should revoke role access', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ deleted_count: 3 }],
      });

      const result = await ownershipService.revokeAccess(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        undefined,
        mockRole.id
      );

      expect(result).toBe(3);
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [mockResource.type, mockResource.id, mockUser1.id, undefined, mockRole.id]
      );
    });

    it('should return 0 when no access to revoke', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ deleted_count: 0 }],
      });

      const result = await ownershipService.revokeAccess(
        mockResource.type,
        mockResource.id,
        mockUser1.id,
        mockUser3.id
      );

      expect(result).toBe(0);
    });

    it('should handle revocation errors', async () => {
      const error = new Error('Revocation failed');
      (pool.query as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        ownershipService.revokeAccess(
          mockResource.type,
          mockResource.id,
          mockUser1.id,
          mockUser3.id
        )
      ).rejects.toThrow('Revocation failed');
    });
  });

  describe('Get Resource Owner', () => {
    it('should get resource owner', async () => {
      const ownedSince = new Date();
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            owner_id: mockUser1.id,
            owner_username: mockUser1.username,
            owner_email: mockUser1.email,
            owned_since: ownedSince,
          },
        ],
      });

      const result = await ownershipService.getResourceOwner(
        mockResource.type,
        mockResource.id
      );

      expect(result).toEqual({
        ownerId: mockUser1.id,
        ownerUsername: mockUser1.username,
        ownerEmail: mockUser1.email,
        ownedSince,
      });
    });

    it('should return null when resource not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await ownershipService.getResourceOwner(
        mockResource.type,
        mockResource.id
      );

      expect(result).toBeNull();
    });
  });

  describe('Get User Owned Resources', () => {
    it('should get all owned resources', async () => {
      const createdAt = new Date();
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            resource_type: 'website',
            resource_id: 'res1',
            created_at: createdAt,
            share_count: 2,
          },
          {
            resource_type: 'clone',
            resource_id: 'res2',
            created_at: createdAt,
            share_count: 0,
          },
        ],
      });

      const result = await ownershipService.getUserOwnedResources(mockUser1.id);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        resourceType: 'website',
        resourceId: 'res1',
        createdAt,
        shareCount: 2,
      });
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_user_owned_resources($1, $2)',
        [mockUser1.id, undefined]
      );
    });

    it('should get owned resources filtered by type', async () => {
      const createdAt = new Date();
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            resource_type: 'website',
            resource_id: 'res1',
            created_at: createdAt,
            share_count: 2,
          },
        ],
      });

      const result = await ownershipService.getUserOwnedResources(
        mockUser1.id,
        'website'
      );

      expect(result).toHaveLength(1);
      expect(result[0].resourceType).toBe('website');
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [mockUser1.id, 'website']
      );
    });

    it('should return empty array when no owned resources', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await ownershipService.getUserOwnedResources(mockUser1.id);

      expect(result).toEqual([]);
    });
  });

  describe('Get Shared With User', () => {
    it('should get resources shared with user', async () => {
      const sharedAt = new Date();
      const expiresAt = new Date('2025-12-31');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            resource_type: 'website',
            resource_id: 'res1',
            owner_id: mockUser1.id,
            owner_username: mockUser1.username,
            permission_level: 'read',
            shared_at: sharedAt,
            expires_at: expiresAt,
          },
          {
            resource_type: 'clone',
            resource_id: 'res2',
            owner_id: mockUser2.id,
            owner_username: mockUser2.username,
            permission_level: 'write',
            shared_at: sharedAt,
            expires_at: null,
          },
        ],
      });

      const result = await ownershipService.getSharedWithUser(mockUser3.id);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        resourceType: 'website',
        resourceId: 'res1',
        ownerId: mockUser1.id,
        ownerUsername: mockUser1.username,
        permissionLevel: 'read',
        sharedAt,
        expiresAt,
      });
      expect(result[1].permissionLevel).toBe('write');
    });

    it('should get shared resources filtered by type', async () => {
      const sharedAt = new Date();
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            resource_type: 'website',
            resource_id: 'res1',
            owner_id: mockUser1.id,
            owner_username: mockUser1.username,
            permission_level: 'admin',
            shared_at: sharedAt,
            expires_at: null,
          },
        ],
      });

      const result = await ownershipService.getSharedWithUser(
        mockUser3.id,
        'website'
      );

      expect(result).toHaveLength(1);
      expect(result[0].resourceType).toBe('website');
      expect(result[0].permissionLevel).toBe('admin');
    });

    it('should return empty array when no shared resources', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await ownershipService.getSharedWithUser(mockUser3.id);

      expect(result).toEqual([]);
    });
  });

  describe('Transfer History', () => {
    it('should get resource transfer history', async () => {
      const transferredAt = new Date();
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'transfer1',
            resource_type: mockResource.type,
            resource_id: mockResource.id,
            from_owner_id: mockUser1.id,
            to_owner_id: mockUser2.id,
            transferred_by: mockUser1.id,
            reason: 'Test transfer',
            metadata: { code: 'TEST' },
            transferred_at: transferredAt,
          },
        ],
      });

      const result = await ownershipService.getResourceTransferHistory(
        mockResource.type,
        mockResource.id
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'transfer1',
        resourceType: mockResource.type,
        resourceId: mockResource.id,
        fromOwnerId: mockUser1.id,
        toOwnerId: mockUser2.id,
        transferredBy: mockUser1.id,
        reason: 'Test transfer',
        metadata: { code: 'TEST' },
        transferredAt,
      });
    });

    it('should get user transfer history', async () => {
      const transferredAt = new Date();
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'transfer1',
            resource_type: 'website',
            resource_id: 'res1',
            from_owner_id: mockUser1.id,
            to_owner_id: mockUser2.id,
            transferred_by: mockUser1.id,
            reason: null,
            metadata: null,
            transferred_at: transferredAt,
          },
          {
            id: 'transfer2',
            resource_type: 'clone',
            resource_id: 'res2',
            from_owner_id: mockUser2.id,
            to_owner_id: mockUser1.id,
            transferred_by: mockUser2.id,
            reason: 'Return',
            metadata: null,
            transferred_at: transferredAt,
          },
        ],
      });

      const result = await ownershipService.getUserTransferHistory(mockUser1.id);

      expect(result).toHaveLength(2);
      expect(result[0].fromOwnerId).toBe(mockUser1.id);
      expect(result[1].toOwnerId).toBe(mockUser1.id);
    });

    it('should respect limit parameter', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await ownershipService.getResourceTransferHistory(
        mockResource.type,
        mockResource.id,
        10
      );

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [mockResource.type, mockResource.id, 10]
      );
    });
  });

  describe('Shared Access Management', () => {
    it('should get resource shared access list', async () => {
      const createdAt = new Date();
      const expiresAt = new Date('2025-12-31');
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'share1',
            resource_type: mockResource.type,
            resource_id: mockResource.id,
            owner_id: mockUser1.id,
            shared_with_user_id: mockUser3.id,
            shared_with_role_id: null,
            permission_level: 'read',
            shared_by: mockUser1.id,
            expires_at: expiresAt,
            created_at: createdAt,
          },
          {
            id: 'share2',
            resource_type: mockResource.type,
            resource_id: mockResource.id,
            owner_id: mockUser1.id,
            shared_with_user_id: null,
            shared_with_role_id: mockRole.id,
            permission_level: 'write',
            shared_by: mockUser1.id,
            expires_at: null,
            created_at: createdAt,
          },
        ],
      });

      const result = await ownershipService.getResourceSharedAccess(
        mockResource.type,
        mockResource.id
      );

      expect(result).toHaveLength(2);
      expect(result[0].sharedWithUserId).toBe(mockUser3.id);
      expect(result[1].sharedWithRoleId).toBe(mockRole.id);
    });

    it('should update shared access permission', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({});

      await ownershipService.updateSharedAccessPermission('share1', 'admin');

      expect(pool.query).toHaveBeenCalledWith(
        'UPDATE shared_resource_access SET permission_level = $1 WHERE id = $2',
        ['admin', 'share1']
      );
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should cleanup expired shares', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: 5 }],
      });

      const result = await ownershipService.cleanupExpiredShares();

      expect(result).toBe(5);
      expect(pool.query).toHaveBeenCalledWith('SELECT cleanup_expired_shares() as count');
    });

    it('should delete resource ownership', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({});

      await ownershipService.deleteResourceOwnership(
        mockResource.type,
        mockResource.id
      );

      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM resource_ownership WHERE resource_type = $1 AND resource_id = $2',
        [mockResource.type, mockResource.id]
      );
    });
  });

  describe('Statistics', () => {
    it('should get ownership statistics', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            resource_type: 'website',
            total_resources: 10,
            total_owners: 5,
            active_shares: 15,
            total_transfers: 3,
          },
          {
            resource_type: 'clone',
            total_resources: 20,
            total_owners: 8,
            active_shares: 25,
            total_transfers: 7,
          },
        ],
      });

      const result = await ownershipService.getOwnershipStatistics();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        resourceType: 'website',
        totalResources: 10,
        totalOwners: 5,
        activeShares: 15,
        totalTransfers: 3,
      });
      expect(result[1].resourceType).toBe('clone');
    });

    it('should return empty array when no statistics', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await ownershipService.getOwnershipStatistics();

      expect(result).toEqual([]);
    });
  });
});
