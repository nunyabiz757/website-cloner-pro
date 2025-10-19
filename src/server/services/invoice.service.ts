import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface Invoice {
    id: string;
    user_id: string;
    subscription_id?: string;
    invoice_number: string;
    status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
    amount_due: number;
    amount_paid: number;
    amount_remaining: number;
    currency: string;
    billing_reason: string;
    period_start?: Date;
    period_end?: Date;
    due_date?: Date;
    paid_at?: Date;
    voided_at?: Date;
    metadata: Record<string, any>;
    invoice_pdf?: string;
    hosted_invoice_url?: string;
    created_at: Date;
    updated_at: Date;
}

export interface InvoiceItem {
    id: string;
    invoice_id: string;
    description: string;
    quantity: number;
    unit_amount: number;
    amount: number;
    currency: string;
    period_start?: Date;
    period_end?: Date;
    metadata: Record<string, any>;
}

export interface CreateInvoiceParams {
    user_id: string;
    subscription_id?: string;
    billing_reason: string;
    amount_due: number;
    currency?: string;
    period_start?: Date;
    period_end?: Date;
    due_date?: Date;
    items: {
        description: string;
        quantity: number;
        unit_amount: number;
    }[];
    metadata?: Record<string, any>;
}

export interface UpdateInvoiceParams {
    status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
    amount_paid?: number;
    due_date?: Date;
    metadata?: Record<string, any>;
}

// =====================================================================================
// Invoice Service
// =====================================================================================

export class InvoiceService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Invoice Creation and Management
    // =====================================================================================

    /**
     * Generate invoice for subscription or one-time payment
     */
    async generateInvoice(params: CreateInvoiceParams): Promise<Invoice> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Generate invoice number
            const invoiceNumberResult = await client.query<{ invoice_number: string }>(
                'SELECT generate_invoice_number() as invoice_number'
            );
            const invoiceNumber = invoiceNumberResult.rows[0].invoice_number;

            // Create invoice
            const invoiceResult = await client.query<Invoice>(
                `INSERT INTO invoices (
                    user_id, subscription_id, invoice_number, status,
                    amount_due, amount_paid, amount_remaining, currency,
                    billing_reason, period_start, period_end, due_date, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [
                    params.user_id,
                    params.subscription_id,
                    invoiceNumber,
                    'draft',
                    params.amount_due,
                    0,
                    params.amount_due,
                    params.currency || 'USD',
                    params.billing_reason,
                    params.period_start,
                    params.period_end,
                    params.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
                    JSON.stringify(params.metadata || {})
                ]
            );

            const invoice = invoiceResult.rows[0];

            // Create invoice items
            for (const item of params.items) {
                await client.query(
                    `INSERT INTO invoice_items (
                        invoice_id, description, quantity, unit_amount,
                        amount, currency, period_start, period_end
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        invoice.id,
                        item.description,
                        item.quantity,
                        item.unit_amount,
                        item.quantity * item.unit_amount,
                        params.currency || 'USD',
                        params.period_start,
                        params.period_end
                    ]
                );
            }

            await client.query('COMMIT');

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'invoice.created',
                resourceType: 'invoice',
                resourceId: invoice.id,
                details: { invoice_number: invoiceNumber, amount: params.amount_due }
            });

            return this.formatInvoice(invoice);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get invoice by ID
     */
    async getInvoiceById(invoiceId: string, userId: string): Promise<Invoice | null> {
        // Check cache
        const cacheKey = `invoice:${invoiceId}`;
        const cached = await this.cache.get<Invoice>(cacheKey);
        if (cached && cached.user_id === userId) {
            return cached;
        }

        const result = await this.pool.query<Invoice>(
            'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
            [invoiceId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const invoice = this.formatInvoice(result.rows[0]);

        // Cache for 5 minutes
        await this.cache.set(cacheKey, invoice, { ttl: 300 });

        return invoice;
    }

    /**
     * Get invoice by invoice number
     */
    async getInvoiceByNumber(invoiceNumber: string, userId: string): Promise<Invoice | null> {
        const result = await this.pool.query<Invoice>(
            'SELECT * FROM invoices WHERE invoice_number = $1 AND user_id = $2',
            [invoiceNumber, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatInvoice(result.rows[0]);
    }

    /**
     * Get invoices for user
     */
    async getUserInvoices(
        userId: string,
        limit: number = 50,
        offset: number = 0,
        status?: string
    ): Promise<Invoice[]> {
        let query = 'SELECT * FROM invoices WHERE user_id = $1';
        const params: any[] = [userId];

        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const result = await this.pool.query<Invoice>(query, params);

        return result.rows.map(row => this.formatInvoice(row));
    }

    /**
     * Get invoices for subscription
     */
    async getSubscriptionInvoices(subscriptionId: string): Promise<Invoice[]> {
        const result = await this.pool.query<Invoice>(
            `SELECT * FROM invoices
             WHERE subscription_id = $1
             ORDER BY created_at DESC`,
            [subscriptionId]
        );

        return result.rows.map(row => this.formatInvoice(row));
    }

    /**
     * Get invoice items
     */
    async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
        const result = await this.pool.query<InvoiceItem>(
            `SELECT * FROM invoice_items
             WHERE invoice_id = $1
             ORDER BY created_at`,
            [invoiceId]
        );

        return result.rows.map(row => this.formatInvoiceItem(row));
    }

    // =====================================================================================
    // Invoice Status Management
    // =====================================================================================

    /**
     * Update invoice status
     */
    async updateInvoiceStatus(
        invoiceId: string,
        userId: string,
        status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible',
        paidAmount?: number
    ): Promise<Invoice> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get current invoice
            const invoiceResult = await client.query<Invoice>(
                'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
                [invoiceId, userId]
            );

            if (invoiceResult.rows.length === 0) {
                throw new Error('Invoice not found');
            }

            const currentInvoice = invoiceResult.rows[0];

            // Calculate amounts
            let amountPaid = currentInvoice.amount_paid;
            if (status === 'paid' && paidAmount !== undefined) {
                amountPaid += paidAmount;
            }

            const amountRemaining = currentInvoice.amount_due - amountPaid;

            // Update invoice
            const updateResult = await client.query<Invoice>(
                `UPDATE invoices
                 SET status = $2,
                     amount_paid = $3,
                     amount_remaining = $4,
                     paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END,
                     voided_at = CASE WHEN $2 = 'void' THEN NOW() ELSE voided_at END,
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [invoiceId, status, amountPaid, amountRemaining]
            );

            await client.query('COMMIT');

            const invoice = updateResult.rows[0];

            // Clear cache
            await this.cache.delete(`invoice:${invoiceId}`);

            // Audit log
            await logAuditEvent({
                userId,
                action: `invoice.${status}`,
                resourceType: 'invoice',
                resourceId: invoiceId,
                details: { status, amount_paid: amountPaid }
            });

            return this.formatInvoice(invoice);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Mark invoice as paid
     */
    async markInvoicePaid(
        invoiceId: string,
        userId: string,
        paymentId: string
    ): Promise<Invoice> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get invoice
            const invoiceResult = await client.query<Invoice>(
                'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
                [invoiceId, userId]
            );

            if (invoiceResult.rows.length === 0) {
                throw new Error('Invoice not found');
            }

            const invoice = invoiceResult.rows[0];

            // Update invoice
            const updateResult = await client.query<Invoice>(
                `UPDATE invoices
                 SET status = 'paid',
                     amount_paid = amount_due,
                     amount_remaining = 0,
                     paid_at = NOW(),
                     updated_at = NOW(),
                     metadata = metadata || jsonb_build_object('payment_id', $3)
                 WHERE id = $1
                 RETURNING *`,
                [invoiceId, userId, paymentId]
            );

            await client.query('COMMIT');

            const updatedInvoice = updateResult.rows[0];

            // Clear cache
            await this.cache.delete(`invoice:${invoiceId}`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'invoice.paid',
                resourceType: 'invoice',
                resourceId: invoiceId,
                details: { amount: invoice.amount_due, payment_id: paymentId }
            });

            return this.formatInvoice(updatedInvoice);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Void invoice
     */
    async voidInvoice(invoiceId: string, userId: string, reason?: string): Promise<Invoice> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            const result = await client.query<Invoice>(
                `UPDATE invoices
                 SET status = 'void',
                     voided_at = NOW(),
                     updated_at = NOW(),
                     metadata = metadata || jsonb_build_object('void_reason', $3)
                 WHERE id = $1 AND user_id = $2
                 RETURNING *`,
                [invoiceId, userId, reason || '']
            );

            if (result.rows.length === 0) {
                throw new Error('Invoice not found');
            }

            await client.query('COMMIT');

            const invoice = result.rows[0];

            // Clear cache
            await this.cache.delete(`invoice:${invoiceId}`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'invoice.voided',
                resourceType: 'invoice',
                resourceId: invoiceId,
                details: { reason }
            });

            return this.formatInvoice(invoice);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================================================
    // Invoice Statistics
    // =====================================================================================

    /**
     * Get invoice statistics for user
     */
    async getInvoiceStatistics(userId: string): Promise<{
        total_invoices: number;
        total_amount: number;
        paid_amount: number;
        outstanding_amount: number;
        by_status: Record<string, number>;
    }> {
        const result = await this.pool.query(
            `SELECT
                COUNT(*) as total_invoices,
                COALESCE(SUM(amount_due), 0) as total_amount,
                COALESCE(SUM(amount_paid), 0) as paid_amount,
                COALESCE(SUM(amount_remaining), 0) as outstanding_amount,
                jsonb_object_agg(status, status_count) as by_status
             FROM invoices
             LEFT JOIN (
                SELECT status, COUNT(*) as status_count
                FROM invoices
                WHERE user_id = $1
                GROUP BY status
             ) status_counts USING (status)
             WHERE user_id = $1`,
            [userId]
        );

        return result.rows[0];
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format invoice from database
     */
    private formatInvoice(row: any): Invoice {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format invoice item from database
     */
    private formatInvoiceItem(row: any): InvoiceItem {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }
}

// Singleton instance
let invoiceServiceInstance: InvoiceService | null = null;

export function getInvoiceService(): InvoiceService {
    if (!invoiceServiceInstance) {
        invoiceServiceInstance = new InvoiceService();
    }
    return invoiceServiceInstance;
}
