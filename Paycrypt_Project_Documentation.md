# Paycrypt - Comprehensive Project Documentation

## Table of Contents
1. [Project Overview and Purpose](#1-project-overview-and-purpose)
2. [Architecture and Technology Stack](#2-architecture-and-technology-stack)
3. [Core Features and Functionality](#3-core-features-and-functionality)
4. [API Documentation](#4-api-documentation)
5. [Application Flow and User Journeys](#5-application-flow-and-user-journeys)
6. [Database Schema and Models](#6-database-schema-and-models)
7. [Security and Authentication](#7-security-and-authentication)
8. [Deployment and Infrastructure](#8-deployment-and-infrastructure)
9. [Supported Cryptocurrencies and Networks](#9-supported-cryptocurrencies-and-networks)
10. [Configuration and Environment Setup](#10-configuration-and-environment-setup)

---

## 1. Project Overview and Purpose

Paycrypt is a comprehensive crypto-native payment gateway SaaS platform designed to enable businesses to accept cryptocurrency payments seamlessly. Built as a TypeScript monorepo, it provides a complete infrastructure for merchants to process, manage, and settle cryptocurrency transactions with the same ease as traditional payment systems.

### Primary Purpose:
- Enable businesses to accept cryptocurrency payments without managing complex blockchain infrastructure
- Provide a Stripe-like API experience for crypto payments
- Support both custodial and non-custodial wallet models
- Offer real-time payment processing and settlement
- Provide comprehensive merchant dashboard and admin panel

### Target Users:
- E-commerce businesses seeking crypto payment options
- Service providers wanting to expand payment methods
- SaaS platforms requiring embedded payment solutions
- Financial technology companies integrating crypto payments

### Platform Scope:
- Merchant login and dashboard
- Super-admin login and dashboard
- JWT access tokens plus refresh-token cookies
- Stripe-like API key model with `pk_live_` and `sk_live_`
- Hosted crypto checkout at `/pay/[id]`
- Public payment-link pages at `/links/[id]`
- Realtime payment updates through Socket.IO
- BullMQ background processing and settlement workflows
- Supabase PostgreSQL schema and migrations
- Node SDK
- Binance custodial integration hooks
- Feature-gated non-custodial wallet onboarding
- First-login merchant password setup flow
- Admin merchant create, update, suspend, and delete lifecycle

---

## 2. Architecture and Technology Stack

### Technology Stack Overview

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 15.5.15 | Merchant and Admin Web Interface |
| API Backend | Express.js | REST API Server |
| WebSocket | Socket.IO | Real-time Payment Updates |
| Background Jobs | BullMQ | Payment Processing and Settlement |
| Database | Supabase PostgreSQL | Primary Data Storage |
| Cache/Queue | Redis 7 | Caching and Job Queue |
| Language | TypeScript | Type-safe Development |
| Deployment | Vercel + AWS EC2 | Scalable Cloud Infrastructure |
| Containerization | Docker | Service Isolation |
| Process Management | Nginx | Load Balancing and Reverse Proxy |

### Monorepo Structure
```
paycrypt/
├── apps/
│   ├── api/         # Express.js REST API server
│   ├── web/         # Next.js frontend application
│   ├── ws/          # Socket.IO WebSocket server
│   └── worker/      # BullMQ background job processors
├── packages/
│   ├── shared/      # Shared TypeScript utilities and types
│   └── sdk/         # Node.js SDK for merchant integration
├── supabase/
│   └── migrations/  # Database schema migrations
├── infra/
│   └── aws/         # AWS deployment configurations
├── scripts/         # Utility scripts
└── docs/           # Documentation files
```

### Service Communication
Services communicate through Redis for real-time updates and job queues, while the API serves as the primary data access layer with PostgreSQL as the persistent storage backend.

### Architecture Diagram
```
Merchant User → Vercel Next.js Frontend → CloudFront HTTPS Edge → Express API on EC2 :4000
Admin User → Vercel Next.js Frontend → CloudFront HTTPS Edge → Socket.IO Gateway on EC2 :4001
Buyer → Vercel Next.js Frontend → CloudFront HTTPS Edge → BullMQ Workers → Redis 7
SDK/Backend → CloudFront HTTPS Edge → Supabase PostgreSQL → Binance Wallet APIs
```

---

## 3. Core Features and Functionality

### Feature Matrix

| Feature Category | Specific Features | Description |
|------------------|------------------|-------------|
| Payment Processing | Payment Intents, Payment Links | Create and manage cryptocurrency payment requests |
| Wallet Management | Custodial & Non-Custodial | Support for both managed and self-hosted wallet solutions |
| Real-time Updates | Socket.IO Integration | Live payment status updates and notifications |
| Merchant Dashboard | Analytics, Reports, Settings | Comprehensive merchant management interface |
| Admin Panel | Merchant Management, Risk Monitoring | Platform administration and oversight tools |
| API Integration | REST API, Webhooks, SDK | Developer-friendly integration options |
| Security | JWT Auth, API Keys, Rate Limiting | Enterprise-grade security measures |
| Settlement | Automated Processing, Multiple Networks | Flexible settlement options across blockchains |
| Billing | Subscription Plans, Usage Tracking | Flexible pricing and billing management |
| Compliance | Audit Logs, KYC Support | Regulatory compliance features |

### Key Differentiators

**Dual Wallet Model:**
Supports both custodial (managed by platform) and non-custodial (merchant-controlled) wallet options, providing flexibility based on merchant preferences and regulatory requirements.

**Real-time Processing:**
WebSocket-based real-time updates ensure merchants and customers receive immediate feedback on payment status changes.

**Multi-Network Support:**
Native support for TRC20 (Tron), ERC20 (Ethereum), and Solana networks, with extensible architecture for additional blockchains.

**Developer-Friendly:**
Stripe-like API design, comprehensive SDK, and detailed documentation for seamless integration.

**Enterprise Security:**
JWT-based authentication, API key management, rate limiting, and comprehensive audit logging for security compliance.

---

## 4. API Documentation

### API Categories

| API Category | Base Path | Authentication | Primary Use |
|--------------|-----------|----------------|-------------|
| Platform API | `/v1` | API Key (sk_live_) | External merchant integrations |
| Dashboard API | `/dashboard` | JWT + Refresh Token | Merchant dashboard functionality |
| Admin API | `/admin` | JWT + Admin Role | Platform administration |
| Auth API | `/auth` | None (login) | Authentication endpoints |
| Public API | `/public` | None | Public payment information |
| WebSocket | `/socket.io` | JWT Token | Real-time updates |

### Platform API Endpoints

#### Payment Management
- `POST /v1/payments` - Create payment intent
- `GET /v1/payments/:id` - Retrieve payment details
- `POST /v1/payment_links` - Create payment link
- `GET /v1/transactions` - List transactions

#### Billing and Settlement
- `GET /v1/invoices` - List billing invoices
- `GET /v1/settlements` - List settlements
- `GET /v1/subscriptions` - Get subscription info

#### Webhooks
- `POST /v1/webhooks` - Create webhook endpoint
- Webhook events: `payment.confirmed`, `payment.failed`, `settlement.completed`

#### Authentication
- Header: `Authorization: Bearer sk_live_xxx`
- Idempotency: `Idempotency-Key: <unique-key>`
- Rate Limiting: 120 requests/minute (configurable)

### Dashboard API Endpoints

#### Overview and Analytics
- `GET /dashboard/overview` - Merchant dashboard metrics
- `GET /dashboard/reports` - Detailed reports and analytics
- `GET /dashboard/payments` - Payment ledger

#### Wallet Management
- `GET /dashboard/wallets` - List merchant wallets
- `POST /dashboard/wallets` - Register non-custodial wallet
- `POST /dashboard/wallets/custodial` - Provision custodial wallet
- `POST /dashboard/wallets/verify` - Initiate wallet verification

#### Settings and Configuration
- `GET /dashboard/settings` - Merchant checkout settings
- `PATCH /dashboard/settings` - Update checkout preferences
- `GET /dashboard/api-keys` - List API keys
- `POST /dashboard/api-keys` - Create new API key pair

#### Webhooks and Integrations
- `GET /dashboard/webhooks` - List webhook endpoints
- `POST /dashboard/webhooks` - Create webhook endpoint
- `POST /dashboard/webhooks/:id/rotate` - Rotate webhook secret

### Admin API Endpoints

#### Merchant Management
- `GET /admin/merchants` - List all merchants
- `POST /admin/merchants` - Create new merchant
- `GET /admin/merchants/:id` - Get merchant details
- `PATCH /admin/merchants/:id` - Update merchant
- `DELETE /admin/merchants/:id` - Delete merchant

#### System Monitoring
- `GET /admin/analytics` - Platform analytics
- `GET /admin/risk` - Risk monitoring
- `GET /admin/system` - System health
- `GET /admin/custody` - Custodial balances

---

## 5. Application Flow and User Journeys

### Merchant Onboarding Flow

#### Step 1: Admin Merchant Creation
1. Super admin creates merchant account via admin panel
2. System generates temporary password and sets `must_change_password` flag
3. Merchant receives credentials via email

#### Step 2: First Login and Password Setup
1. Merchant logs in with temporary credentials
2. System redirects to `/setup-password` page
3. Merchant sets permanent password (minimum 10 characters)
4. System clears forced-reset flag and issues fresh JWT tokens
5. Merchant gains access to dashboard

#### Step 3: Wallet Configuration
1. Merchant chooses between custodial and non-custodial options
2. For custodial: Provision wallets via Binance integration
3. For non-custodial: Register existing wallet addresses
4. System performs wallet verification process
5. Merchant selects preferred settlement networks

#### Step 4: API Integration
1. Merchant generates API key pair (public/secret)
2. Configure webhook endpoints for real-time notifications
3. Test integration with payment preview functionality
4. Go live with production API keys

### Payment Processing Flow

#### Step 1: Payment Intent Creation
1. Merchant creates payment intent via API or dashboard
2. System determines optimal wallet route and pricing
3. Payment intent is stored with unique ID and expiration
4. QR code and payment details are generated

#### Step 2: Customer Payment
1. Customer accesses hosted checkout page (`/pay/[id]`)
2. System displays payment details and QR code
3. Customer initiates cryptocurrency transfer
4. WebSocket connection established for real-time updates

#### Step 3: Transaction Monitoring
1. Background workers monitor blockchain for transaction confirmation
2. System validates transaction amount and recipient
3. Payment status updated in real-time via WebSocket
4. Customer and merchant receive immediate notifications

#### Step 4: Settlement Processing
1. Confirmed transactions queued for settlement
2. System processes settlement based on merchant preferences
3. Funds transferred to merchant settlement addresses
4. Webhook notifications sent for settlement completion
5. Transaction records updated in merchant ledger

### Admin Management Flow

#### Merchant Lifecycle Management
- Create new merchant accounts with plan assignments
- Update merchant information and status
- Suspend or terminate merchant accounts
- Manage merchant subscription plans and billing

#### Risk and Compliance Monitoring
- Monitor transaction volumes and patterns
- Review wallet verification requests
- Track system performance and queue health
- Manage system alerts and notifications

#### Platform Operations
- Monitor custodial wallet balances (Binance integration)
- Review settlement processing and fund movements
- Analyze platform revenue and metrics
- Manage system configuration and feature flags

---

## 6. Database Schema and Models

Paycrypt uses Supabase PostgreSQL as its primary database with a comprehensive schema designed to support multi-tenant architecture with proper isolation and security.

### Core Tables

- **merchants**: Primary merchant accounts with billing and configuration
- **users**: User accounts linked to merchants with role-based access
- **payments**: Payment intents and transaction records
- **transactions**: Blockchain transaction details and confirmations
- **wallets**: Merchant wallet configurations (custodial/non-custodial)
- **settlements**: Settlement processing records and status
- **api_keys**: Merchant API key management with scopes and rate limits
- **webhook_endpoints**: Webhook configurations and event subscriptions
- **subscriptions**: Merchant subscription plans and billing details
- **billing_invoices**: Invoice generation and payment tracking

### Key Relationships and Constraints

#### Multi-Tenant Isolation
- All merchant data isolated by `merchant_id` foreign keys
- Row-level security policies ensure data isolation
- Audit logging tracks all data modifications

#### Payment Flow Relationships
- `payments` → `transactions` (one-to-many for blockchain events)
- `payments` → `settlements` (one-to-one for settlement processing)
- `wallets` → `payments` (many-to-many for payment routing)

#### User Access Control
- `users` → `merchants` (many-to-one for merchant assignment)
- `api_keys` → `merchants` (many-to-one for API access)
- `webhook_endpoints` → `merchants` (many-to-one for webhooks)

#### Billing and Subscriptions
- `merchants` → `subscriptions` (one-to-one for active plan)
- `subscriptions` → `billing_invoices` (one-to-many for billing)

### Subscription Plans

The platform supports three subscription tiers:

1. **Starter Plan**
   - Platform fee: 1%
   - Non-custodial wallets: 0
   - Setup fee: 0 INR/USDT
   - Basic features only

2. **Custom Selective Plan**
   - Platform fee: 2%
   - Non-custodial wallets: 1
   - Setup fee: 0 INR/USDT
   - Advanced features

3. **Custom Enterprise Plan**
   - Platform fee: Customizable
   - Non-custodial wallets: Unlimited
   - Setup fee: 10,000 INR/USDT
   - Full feature access

---

## 7. Security and Authentication

### Security Layers

| Security Layer | Implementation | Purpose |
|----------------|----------------|---------|
| Authentication | JWT Access + Refresh Tokens | Secure user session management |
| API Security | API Keys with Scopes | Programmatic access control |
| Rate Limiting | Redis-based Rate Limiting | Prevent abuse and ensure stability |
| Data Encryption | Field-level Encryption | Protect sensitive data at rest |
| Audit Logging | Comprehensive Audit Trail | Track all system actions |
| Webhook Security | HMAC Signature Verification | Secure webhook delivery |
| Network Security | HTTPS/WSS Only | Encrypt all network communications |
| Input Validation | Strict Input Sanitization | Prevent injection attacks |
| Password Security | bcrypt Hashing | Secure password storage |
| Session Management | HttpOnly Cookies | Prevent session hijacking |

### JWT Token Structure
- **Access Tokens**: Short-lived (15 minutes) for API requests
- **Refresh Tokens**: Long-lived (30 days) stored in HttpOnly cookies
- **Token Payload**: User ID, merchant ID, role, and permissions

### API Key Management
- **Public Keys (pk_live_)**: Read-only operations
- **Secret Keys (sk_live_)**: Full access operations
- **Scopes**: `payments:read`, `payments:write`, `webhooks:write`, etc.
- **Rate Limits**: Configurable per key (default: 120/minute)

### Security Best Practices
- All passwords hashed with bcrypt (cost factor: 12)
- Sensitive data encrypted at rest using AES-256
- Regular security audits and penetration testing
- Compliance with PCI DSS and GDPR requirements

### Authentication Flow
1. User submits email/password to `/auth/login`
2. System validates credentials against database
3. On success, generates JWT access and refresh tokens
4. Refresh token stored in HttpOnly cookie
5. Access token returned for API requests
6. Refresh token used to obtain new access tokens
7. Logout revokes refresh tokens and clears cookies

---

## 8. Deployment and Infrastructure

Paycrypt employs a modern, scalable cloud infrastructure designed for high availability and performance across global markets.

### Frontend Deployment
- **Platform**: Vercel (Edge Network)
- **Project**: paycrypt-web-live
- **Global CDN**: Automatic edge distribution
- **Environment**: Production and preview deployments

### Backend Deployment
- **Platform**: AWS EC2 (ap-south-1 region)
- **Services**: API, WebSocket, Worker, Redis
- **Load Balancer**: Nginx with SSL termination
- **Monitoring**: Custom health checks and telemetry

### Database Infrastructure
- **Platform**: Supabase (PostgreSQL)
- **Region**: Global with automatic failover
- **Backups**: Automated daily backups with point-in-time recovery
- **Migrations**: Version-controlled schema migrations

### Infrastructure Components

| Component | Provider | Configuration | Monitoring |
|-----------|----------|---------------|------------|
| Frontend | Vercel | Edge Network, Auto-scaling | Real-time logs, Analytics |
| API Server | AWS EC2 | t3.medium, Auto-scaling | Health checks, Metrics |
| WebSocket | AWS EC2 | t3.small, Redis cluster | Latency monitoring |
| Worker | AWS EC2 | t3.medium, Queue monitoring | Job processing metrics |
| Database | Supabase | Managed PostgreSQL | Performance monitoring |
| Cache/Queue | Redis | Cluster mode, Persistence | Memory usage, Latency |
| CDN | CloudFront | Edge distribution | Cache hit ratios |
| DNS | Route 53 | Health checks, Failover | Uptime monitoring |

### Environment Configuration

#### Development
- Local Docker Compose setup
- Hot reload for development
- Test database and Redis instances

#### Staging
- Mirror of production with test data
- Full feature testing environment
- Performance testing capabilities

#### Production
- Full-scale deployment with monitoring
- High availability and redundancy
- Automated scaling and recovery

### CI/CD Pipeline
- **Frontend**: Automatic Vercel deployment on main branch
- **Backend**: Manual deployment with health checks
- **Database**: Automated migration execution
- **Monitoring**: Post-deployment verification

### Monitoring and Observability
- **Application metrics**: Custom telemetry collection
- **Infrastructure**: AWS CloudWatch integration
- **Error tracking**: Comprehensive error logging
- **Performance**: Response time and throughput monitoring

---

## 9. Supported Cryptocurrencies and Networks

### Supported Assets

| Asset | Networks | Settlement Currency | Wallet Type |
|-------|----------|-------------------|-------------|
| Bitcoin (BTC) | Bitcoin | BTC | Custodial Only |
| Ethereum (ETH) | ERC20 | ETH | Custodial Only |
| Tether (USDT) | TRC20, ERC20, SOL | USDT | Both |
| USDC | ERC20, SOL | USDC | Both |
| Other ERC20 | ERC20 | Various | Non-Custodial |
| Solana Tokens | Solana | Various | Non-Custodial |
| TRC20 Tokens | TRC20 | Various | Non-Custodial |

### Network Infrastructure

#### Tron (TRC20)
- **RPC Endpoint**: https://api.trongrid.io
- **Confirmation Time**: ~1-2 minutes
- **Fees**: Minimal TRX gas fees
- **Popular for**: USDT transfers

#### Ethereum (ERC20)
- **RPC Endpoint**: https://rpc.ankr.com/eth
- **Confirmation Time**: ~15-30 minutes (depending on gas)
- **Fees**: Variable gas fees
- **Popular for**: USDC, DAI, other stablecoins

#### Solana
- **RPC Endpoint**: https://api.mainnet-beta.solana.com
- **Confirmation Time**: ~2-3 seconds
- **Fees**: Minimal SOL fees
- **Popular for**: USDC, SOL, SPL tokens

#### Bitcoin
- **Native Bitcoin network**
- **Confirmation Time**: ~60 minutes
- **Fees**: Variable network fees
- **Custodial only**: Managed through Binance integration

### Settlement Processing

- **Real-time Processing**: Immediate settlement for supported networks
- **Batch Processing**: Periodic settlement for high-volume transactions
- **Multi-currency Support**: Settlement in original or converted currency
- **Network Optimization**: Automatic routing to lowest-fee networks

### Price Oracle Integration
- **Source**: CoinGecko API
- **Update Frequency**: Every 5 minutes
- **Pairs**: 50+ cryptocurrency/fiat pairs
- **Fallback**: Multiple oracle providers for reliability

### Custodial vs Non-Custodial

#### Custodial Model
- Platform manages private keys
- Binance integration for wallet provisioning
- Faster settlement and processing
- Lower complexity for merchants

#### Non-Custodial Model
- Merchants control their own keys
- Wallet verification process required
- Higher security and control
- Suitable for compliance requirements

---

## 10. Configuration and Environment Setup

### Environment Variables

| Category | Environment Variable | Purpose | Example |
|----------|---------------------|---------|---------|
| Application | NODE_ENV | Environment mode | development |
| Application | PORT | API server port | 4000 |
| Application | WS_PORT | WebSocket port | 4001 |
| Database | DATABASE_URL | PostgreSQL connection | postgresql://... |
| Database | SUPABASE_URL | Supabase project URL | https://... |
| Database | SUPABASE_SERVICE_ROLE_KEY | Supabase admin key | service-role-key |
| Security | JWT_ACCESS_SECRET | JWT signing secret | strong-secret |
| Security | JWT_REFRESH_SECRET | Refresh token secret | strong-secret |
| Security | WEBHOOK_SIGNING_SECRET | Webhook HMAC secret | webhook-secret |
| Security | ENCRYPTION_KEY | Data encryption key | base64-key |
| External | REDIS_URL | Redis connection | redis://localhost:6379 |
| External | BINANCE_API_KEY | Binance API key | api-key |
| External | BINANCE_API_SECRET | Binance secret | api-secret |
| External | ETHEREUM_RPC_URL | Ethereum RPC | https://rpc.ankr.com/eth |
| External | SOLANA_RPC_URL | Solana RPC | https://api.mainnet-beta.solana.com |
| External | PRICE_ORACLE_BASE_URL | Price oracle | https://api.coingecko.com |

### Local Development Setup

#### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL client tools
- Redis server

#### Setup Steps
1. Clone repository and navigate to root directory
2. Copy `.env.example` to `.env` and configure variables
3. Install dependencies: `npm install`
4. Run database migrations: `npm run migrate:db`
5. Seed demo data: `npm run seed:demo`
6. Start services: `npm run dev:api`, `npm run dev:ws`, `npm run dev:web`

#### Service URLs
- **Frontend**: http://localhost:3003
- **API**: http://localhost:4000
- **WebSocket**: http://localhost:4001
- **Redis**: localhost:6379

#### Docker Development
- Use `docker-compose.yml` for full stack development
- Includes nginx, redis, and all application services
- Automatic health checks and service dependencies
- Volume mounts for live code reloading

### Production Configuration

#### Security Requirements
- All secrets must be strong and unique
- HTTPS/WSS required for all communications
- Regular key rotation recommended
- Environment variables should be managed securely

#### Performance Optimization
- Redis cluster for high availability
- Database connection pooling
- CDN configuration for static assets
- Load balancing for API services

#### Monitoring and Logging
- Structured logging with correlation IDs
- Performance metrics collection
- Error tracking and alerting
- Health check endpoints

#### Backup and Recovery
- Automated database backups
- Configuration version control
- Disaster recovery procedures
- Regular restore testing

### Demo Credentials
- **Merchant**: `owner@nebula.dev` / `ChangeMe123!`
- **Admin**: `admin@cryptopay.dev` / `AdminChangeMe123!`

New merchants created by the admin panel receive a temporary password and are forced through first-login password setup before dashboard access is allowed.

---

## Conclusion

Paycrypt represents a comprehensive, enterprise-grade solution for cryptocurrency payment processing. Its architecture combines modern web technologies with robust security practices and scalable infrastructure design.

### Key Strengths
- Comprehensive feature set covering all aspects of crypto payment processing
- Flexible architecture supporting both custodial and non-custodial models
- Developer-friendly API design with extensive documentation and SDK support
- Enterprise-grade security with proper authentication and authorization
- Scalable infrastructure designed for global deployment
- Real-time processing capabilities enhancing user experience
- Extensive monitoring and observability features

### Future Enhancements
- Additional blockchain network support
- Advanced fraud detection and risk management
- Enhanced analytics and reporting capabilities
- Mobile SDK development
- DeFi protocol integration

This platform provides a solid foundation for businesses seeking to integrate cryptocurrency payments into their operations while maintaining security, compliance, and user experience standards.

---

*Generated on: April 23, 2026*
