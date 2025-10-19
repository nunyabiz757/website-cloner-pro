import crypto from 'crypto';
import dns from 'dns/promises';

/**
 * Custom Domain Preview Service
 *
 * Handles custom domain preview functionality including:
 * - Temporary subdomain assignment
 * - Custom domain configuration
 * - SSL certificate handling
 * - DNS verification
 */

// Types
export interface PreviewDomain {
  id: string;
  projectId: string;
  userId: string;
  subdomain: string;
  fullDomain: string;
  customDomain?: string;
  status: 'pending' | 'active' | 'expired' | 'error';
  sslStatus: 'pending' | 'issued' | 'error';
  sslCertificate?: SSLCertificate;
  createdAt: Date;
  expiresAt: Date;
  lastAccessed?: Date;
  settings: DomainSettings;
}

export interface SSLCertificate {
  provider: 'letsencrypt' | 'cloudflare' | 'manual';
  status: 'pending' | 'issued' | 'expired' | 'error';
  issuedAt?: Date;
  expiresAt?: Date;
  commonName: string;
  altNames?: string[];
  certificatePath?: string;
  privateKeyPath?: string;
  autoRenew: boolean;
}

export interface DomainSettings {
  passwordProtected: boolean;
  password?: string;
  allowedIPs?: string[];
  customHeaders?: Record<string, string>;
  redirects?: DomainRedirect[];
  cacheEnabled: boolean;
  compressionEnabled: boolean;
}

export interface DomainRedirect {
  from: string;
  to: string;
  statusCode: 301 | 302 | 307 | 308;
}

export interface SubdomainRequest {
  projectId: string;
  userId: string;
  preferredSubdomain?: string;
  expirationDays?: number;
  settings?: Partial<DomainSettings>;
}

export interface CustomDomainRequest {
  previewDomainId: string;
  customDomain: string;
  sslProvider?: 'letsencrypt' | 'cloudflare' | 'manual';
}

export interface DNSVerification {
  domain: string;
  verified: boolean;
  records: DNSRecord[];
  requiredRecords: RequiredDNSRecord[];
  missingRecords: RequiredDNSRecord[];
  issues: string[];
}

export interface DNSRecord {
  type: 'A' | 'CNAME' | 'TXT' | 'MX';
  name: string;
  value: string;
  ttl?: number;
}

export interface RequiredDNSRecord {
  type: 'A' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  purpose: string;
}

export interface SSLSetup {
  domain: string;
  provider: 'letsencrypt' | 'cloudflare' | 'manual';
  status: 'ready' | 'pending' | 'error';
  steps: SSLStep[];
  certificate?: SSLCertificate;
  instructions: string[];
}

export interface SSLStep {
  step: number;
  title: string;
  description: string;
  status: 'pending' | 'completed' | 'error';
  command?: string;
}

export interface DomainConfiguration {
  domain: PreviewDomain;
  dnsConfiguration: DNSConfiguration;
  sslConfiguration: SSLSetup;
  nginxConfiguration?: string;
  apacheConfiguration?: string;
}

export interface DNSConfiguration {
  provider: 'cloudflare' | 'route53' | 'custom';
  records: RequiredDNSRecord[];
  instructions: string[];
  verificationStatus: 'pending' | 'verified' | 'failed';
}

class CustomDomainPreviewService {
  private readonly baseDomain = process.env.PREVIEW_BASE_DOMAIN || 'preview.websitecloner.pro';
  private readonly previewDomains: Map<string, PreviewDomain> = new Map();
  private readonly defaultExpirationDays = 30;

  /**
   * Create a temporary subdomain for preview
   */
  async createSubdomain(request: SubdomainRequest): Promise<PreviewDomain> {
    // Generate subdomain
    const subdomain = request.preferredSubdomain
      ? this.sanitizeSubdomain(request.preferredSubdomain)
      : this.generateRandomSubdomain();

    // Check availability
    if (await this.isSubdomainTaken(subdomain)) {
      throw new Error(`Subdomain ${subdomain} is already taken`);
    }

    const id = this.generateId();
    const fullDomain = `${subdomain}.${this.baseDomain}`;
    const expirationDays = request.expirationDays || this.defaultExpirationDays;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const previewDomain: PreviewDomain = {
      id,
      projectId: request.projectId,
      userId: request.userId,
      subdomain,
      fullDomain,
      status: 'pending',
      sslStatus: 'pending',
      createdAt: new Date(),
      expiresAt,
      settings: {
        passwordProtected: false,
        cacheEnabled: true,
        compressionEnabled: true,
        ...request.settings,
      },
    };

    // Store in memory (in production, use database)
    this.previewDomains.set(id, previewDomain);

    // Initiate SSL certificate
    await this.initiateSSL(previewDomain);

    return previewDomain;
  }

  /**
   * Add custom domain to existing preview
   */
  async addCustomDomain(request: CustomDomainRequest): Promise<PreviewDomain> {
    const previewDomain = this.previewDomains.get(request.previewDomainId);

    if (!previewDomain) {
      throw new Error('Preview domain not found');
    }

    // Validate custom domain
    const customDomain = this.validateDomain(request.customDomain);

    // Check DNS configuration
    const dnsVerification = await this.verifyDNS(customDomain);

    if (!dnsVerification.verified) {
      throw new Error(`DNS verification failed: ${dnsVerification.issues.join(', ')}`);
    }

    // Update preview domain
    previewDomain.customDomain = customDomain;
    previewDomain.status = 'pending';

    // Setup SSL for custom domain
    const sslSetup = await this.setupSSL(customDomain, request.sslProvider || 'letsencrypt');

    if (sslSetup.status === 'ready') {
      previewDomain.sslStatus = 'issued';
      previewDomain.sslCertificate = sslSetup.certificate;
      previewDomain.status = 'active';
    }

    this.previewDomains.set(previewDomain.id, previewDomain);

    return previewDomain;
  }

  /**
   * Verify DNS configuration for custom domain
   */
  async verifyDNS(domain: string): Promise<DNSVerification> {
    const requiredRecords: RequiredDNSRecord[] = [
      {
        type: 'A',
        name: domain,
        value: process.env.SERVER_IP || '0.0.0.0',
        purpose: 'Points domain to preview server',
      },
      {
        type: 'CNAME',
        name: `www.${domain}`,
        value: domain,
        purpose: 'WWW subdomain redirect',
      },
    ];

    const records: DNSRecord[] = [];
    const issues: string[] = [];

    try {
      // Check A record
      const aRecords = await dns.resolve4(domain);
      if (aRecords.length > 0) {
        records.push({
          type: 'A',
          name: domain,
          value: aRecords[0],
        });
      } else {
        issues.push(`No A record found for ${domain}`);
      }
    } catch (error) {
      issues.push(`Failed to resolve A record for ${domain}`);
    }

    try {
      // Check CNAME for www
      const cnameRecords = await dns.resolveCname(`www.${domain}`);
      if (cnameRecords.length > 0) {
        records.push({
          type: 'CNAME',
          name: `www.${domain}`,
          value: cnameRecords[0],
        });
      }
    } catch (error) {
      // WWW CNAME is optional
    }

    // Check if required records match
    const missingRecords = requiredRecords.filter(required => {
      const found = records.find(
        r => r.type === required.type && r.name === required.name
      );
      if (!found) return true;
      if (required.type === 'A' && found.value !== required.value) {
        issues.push(
          `A record points to ${found.value}, expected ${required.value}`
        );
        return true;
      }
      return false;
    });

    const verified = issues.length === 0 && missingRecords.length === 0;

    return {
      domain,
      verified,
      records,
      requiredRecords,
      missingRecords,
      issues,
    };
  }

  /**
   * Setup SSL certificate
   */
  async setupSSL(
    domain: string,
    provider: 'letsencrypt' | 'cloudflare' | 'manual' = 'letsencrypt'
  ): Promise<SSLSetup> {
    const steps: SSLStep[] = [];

    if (provider === 'letsencrypt') {
      steps.push(
        {
          step: 1,
          title: 'Install Certbot',
          description: 'Install Certbot for Let\'s Encrypt certificate management',
          status: 'pending',
          command: 'sudo apt-get install certbot python3-certbot-nginx',
        },
        {
          step: 2,
          title: 'Request Certificate',
          description: 'Request SSL certificate from Let\'s Encrypt',
          status: 'pending',
          command: `sudo certbot --nginx -d ${domain} -d www.${domain}`,
        },
        {
          step: 3,
          title: 'Verify Installation',
          description: 'Verify SSL certificate is properly installed',
          status: 'pending',
          command: `curl -I https://${domain}`,
        },
        {
          step: 4,
          title: 'Setup Auto-Renewal',
          description: 'Configure automatic certificate renewal',
          status: 'pending',
          command: 'sudo certbot renew --dry-run',
        }
      );
    } else if (provider === 'cloudflare') {
      steps.push(
        {
          step: 1,
          title: 'Enable Cloudflare',
          description: 'Add domain to Cloudflare',
          status: 'pending',
        },
        {
          step: 2,
          title: 'Update Nameservers',
          description: 'Point domain nameservers to Cloudflare',
          status: 'pending',
        },
        {
          step: 3,
          title: 'Enable SSL',
          description: 'Enable Full SSL mode in Cloudflare',
          status: 'pending',
        },
        {
          step: 4,
          title: 'Install Origin Certificate',
          description: 'Install Cloudflare origin certificate on server',
          status: 'pending',
        }
      );
    } else {
      steps.push(
        {
          step: 1,
          title: 'Generate CSR',
          description: 'Generate Certificate Signing Request',
          status: 'pending',
          command: `openssl req -new -newkey rsa:2048 -nodes -keyout ${domain}.key -out ${domain}.csr`,
        },
        {
          step: 2,
          title: 'Purchase Certificate',
          description: 'Purchase SSL certificate from provider',
          status: 'pending',
        },
        {
          step: 3,
          title: 'Install Certificate',
          description: 'Install certificate and private key on server',
          status: 'pending',
        },
        {
          step: 4,
          title: 'Configure Web Server',
          description: 'Update web server configuration for SSL',
          status: 'pending',
        }
      );
    }

    const instructions: string[] = [];

    if (provider === 'letsencrypt') {
      instructions.push(
        'Let\'s Encrypt provides free SSL certificates with automatic renewal',
        'Certificates are valid for 90 days and auto-renew',
        'Ensure port 80 and 443 are open for verification',
        'Domain must be publicly accessible for verification'
      );
    } else if (provider === 'cloudflare') {
      instructions.push(
        'Cloudflare provides free SSL with their service',
        'Requires domain to use Cloudflare nameservers',
        'SSL certificate is managed automatically',
        'Origin certificate needed for server-to-Cloudflare encryption'
      );
    } else {
      instructions.push(
        'Manual SSL setup requires purchasing a certificate',
        'Certificate must be renewed annually (typically)',
        'Private key must be kept secure',
        'Web server must be configured for HTTPS'
      );
    }

    return {
      domain,
      provider,
      status: 'pending',
      steps,
      instructions,
    };
  }

  /**
   * Get domain configuration
   */
  async getDomainConfiguration(domainId: string): Promise<DomainConfiguration> {
    const domain = this.previewDomains.get(domainId);

    if (!domain) {
      throw new Error('Domain not found');
    }

    const targetDomain = domain.customDomain || domain.fullDomain;

    // DNS Configuration
    const dnsConfiguration: DNSConfiguration = {
      provider: 'cloudflare',
      records: [
        {
          type: 'A',
          name: targetDomain,
          value: process.env.SERVER_IP || '0.0.0.0',
          purpose: 'Points domain to preview server',
        },
        {
          type: 'CNAME',
          name: `www.${targetDomain}`,
          value: targetDomain,
          purpose: 'WWW subdomain',
        },
      ],
      instructions: [
        'Log in to your DNS provider',
        'Add the A record pointing to the server IP',
        'Add the CNAME record for www subdomain',
        'Wait for DNS propagation (can take up to 48 hours)',
        'Verify DNS using the verification endpoint',
      ],
      verificationStatus: 'pending',
    };

    // SSL Configuration
    const sslConfiguration = await this.setupSSL(
      targetDomain,
      domain.sslCertificate?.provider || 'letsencrypt'
    );

    // Nginx Configuration
    const nginxConfiguration = this.generateNginxConfig(domain);

    // Apache Configuration
    const apacheConfiguration = this.generateApacheConfig(domain);

    return {
      domain,
      dnsConfiguration,
      sslConfiguration,
      nginxConfiguration,
      apacheConfiguration,
    };
  }

  /**
   * Generate Nginx configuration
   */
  private generateNginxConfig(domain: PreviewDomain): string {
    const targetDomain = domain.customDomain || domain.fullDomain;
    const projectPath = `/var/www/previews/${domain.projectId}`;

    let config = `# Nginx configuration for ${targetDomain}\n\n`;

    // HTTP to HTTPS redirect
    config += `server {
    listen 80;
    listen [::]:80;
    server_name ${targetDomain} www.${targetDomain};

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}\n\n`;

    // HTTPS server block
    config += `server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${targetDomain} www.${targetDomain};

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${targetDomain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${targetDomain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Root directory
    root ${projectPath};
    index index.html index.htm;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
\n`;

    // Password protection
    if (domain.settings.passwordProtected) {
      config += `    # Password protection
    auth_basic "Preview Access";
    auth_basic_user_file /etc/nginx/.htpasswd_${domain.id};
\n`;
    }

    // Compression
    if (domain.settings.compressionEnabled) {
      config += `    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
\n`;
    }

    // Cache control
    if (domain.settings.cacheEnabled) {
      config += `    # Cache static assets
    location ~* \\.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
\n`;
    }

    // Main location
    config += `    # Main location
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
}`;

    return config;
  }

  /**
   * Generate Apache configuration
   */
  private generateApacheConfig(domain: PreviewDomain): string {
    const targetDomain = domain.customDomain || domain.fullDomain;
    const projectPath = `/var/www/previews/${domain.projectId}`;

    let config = `# Apache configuration for ${targetDomain}\n\n`;

    // HTTP VirtualHost (redirect to HTTPS)
    config += `<VirtualHost *:80>
    ServerName ${targetDomain}
    ServerAlias www.${targetDomain}

    # Redirect to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>\n\n`;

    // HTTPS VirtualHost
    config += `<VirtualHost *:443>
    ServerName ${targetDomain}
    ServerAlias www.${targetDomain}

    DocumentRoot ${projectPath}

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/${targetDomain}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${targetDomain}/privkey.pem
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5

    # Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "no-referrer-when-downgrade"
\n`;

    // Password protection
    if (domain.settings.passwordProtected) {
      config += `    # Password protection
    <Directory ${projectPath}>
        AuthType Basic
        AuthName "Preview Access"
        AuthUserFile /etc/apache2/.htpasswd_${domain.id}
        Require valid-user
    </Directory>
\n`;
    }

    // Compression
    if (domain.settings.compressionEnabled) {
      config += `    # Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
    </IfModule>
\n`;
    }

    // Cache control
    if (domain.settings.cacheEnabled) {
      config += `    # Cache Control
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/jpg "access plus 1 year"
        ExpiresByType image/jpeg "access plus 1 year"
        ExpiresByType image/gif "access plus 1 year"
        ExpiresByType image/png "access plus 1 year"
        ExpiresByType text/css "access plus 1 month"
        ExpiresByType application/javascript "access plus 1 month"
        ExpiresByType image/svg+xml "access plus 1 year"
        ExpiresByType font/woff "access plus 1 year"
        ExpiresByType font/woff2 "access plus 1 year"
    </IfModule>
\n`;
    }

    config += `    # Directory settings
    <Directory ${projectPath}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Rewrite for SPA
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # Error pages
    ErrorDocument 404 /404.html
    ErrorDocument 500 /50x.html
</VirtualHost>`;

    return config;
  }

  /**
   * Update domain settings
   */
  async updateSettings(
    domainId: string,
    settings: Partial<DomainSettings>
  ): Promise<PreviewDomain> {
    const domain = this.previewDomains.get(domainId);

    if (!domain) {
      throw new Error('Domain not found');
    }

    domain.settings = {
      ...domain.settings,
      ...settings,
    };

    this.previewDomains.set(domainId, domain);

    return domain;
  }

  /**
   * Delete preview domain
   */
  async deleteDomain(domainId: string): Promise<boolean> {
    const domain = this.previewDomains.get(domainId);

    if (!domain) {
      throw new Error('Domain not found');
    }

    // In production, cleanup SSL certificates, files, etc.
    this.previewDomains.delete(domainId);

    return true;
  }

  /**
   * Get domain by ID
   */
  async getDomain(domainId: string): Promise<PreviewDomain | null> {
    return this.previewDomains.get(domainId) || null;
  }

  /**
   * List domains for user
   */
  async listDomains(userId: string): Promise<PreviewDomain[]> {
    return Array.from(this.previewDomains.values()).filter(
      d => d.userId === userId
    );
  }

  /**
   * Extend domain expiration
   */
  async extendExpiration(domainId: string, days: number): Promise<PreviewDomain> {
    const domain = this.previewDomains.get(domainId);

    if (!domain) {
      throw new Error('Domain not found');
    }

    domain.expiresAt = new Date(domain.expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
    this.previewDomains.set(domainId, domain);

    return domain;
  }

  /**
   * Helper: Generate random subdomain
   */
  private generateRandomSubdomain(): string {
    const adjectives = ['quick', 'bright', 'calm', 'bold', 'swift', 'neat', 'keen', 'wise'];
    const nouns = ['fox', 'wolf', 'bear', 'lion', 'hawk', 'owl', 'dove', 'deer'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 9999);

    return `${adjective}-${noun}-${number}`;
  }

  /**
   * Helper: Sanitize subdomain
   */
  private sanitizeSubdomain(subdomain: string): string {
    return subdomain
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63);
  }

  /**
   * Helper: Check if subdomain is taken
   */
  private async isSubdomainTaken(subdomain: string): Promise<boolean> {
    return Array.from(this.previewDomains.values()).some(
      d => d.subdomain === subdomain
    );
  }

  /**
   * Helper: Validate domain
   */
  private validateDomain(domain: string): string {
    // Remove protocol and trailing slash
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Basic domain validation
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;

    if (!domainRegex.test(domain)) {
      throw new Error('Invalid domain format');
    }

    return domain.toLowerCase();
  }

  /**
   * Helper: Generate unique ID
   */
  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Helper: Initiate SSL certificate
   */
  private async initiateSSL(domain: PreviewDomain): Promise<void> {
    // In production, trigger actual SSL certificate generation
    domain.sslCertificate = {
      provider: 'letsencrypt',
      status: 'pending',
      commonName: domain.fullDomain,
      autoRenew: true,
    };

    // Simulate SSL issuance
    setTimeout(() => {
      domain.sslStatus = 'issued';
      domain.sslCertificate!.status = 'issued';
      domain.sslCertificate!.issuedAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90); // Let's Encrypt 90-day cert
      domain.sslCertificate!.expiresAt = expiresAt;
      domain.status = 'active';
    }, 1000);
  }
}

export default new CustomDomainPreviewService();
