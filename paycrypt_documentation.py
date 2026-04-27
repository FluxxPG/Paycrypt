#!/usr/bin/env python3
"""
Paycrypt Project Documentation Generator
Creates a comprehensive PDF documentation about the Paycrypt crypto payment gateway.
"""

from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
import datetime

# Create custom styles
styles = getSampleStyleSheet()
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=24,
    spaceAfter=30,
    alignment=TA_CENTER,
    textColor=colors.darkblue
)

heading_style = ParagraphStyle(
    'CustomHeading',
    parent=styles['Heading2'],
    fontSize=16,
    spaceAfter=12,
    spaceBefore=20,
    textColor=colors.darkblue
)

subheading_style = ParagraphStyle(
    'CustomSubHeading',
    parent=styles['Heading3'],
    fontSize=14,
    spaceAfter=8,
    spaceBefore=12,
    textColor=colors.darkgreen
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=11,
    spaceAfter=6,
    alignment=TA_JUSTIFY
)

code_style = ParagraphStyle(
    'Code',
    parent=styles['Normal'],
    fontSize=10,
    fontName='Courier',
    backgroundColor=colors.lightgrey,
    leftIndent=20
)

def create_header_footer(canvas, doc):
    """Create header and footer for each page"""
    canvas.saveState()
    
    # Header
    canvas.setFont('Helvetica', 10)
    canvas.setFillColor(colors.darkblue)
    canvas.drawString(inch, A4[1] - inch, "Paycrypt - Crypto Payment Gateway SaaS")
    
    # Footer
    canvas.setFillColor(colors.grey)
    canvas.drawCentredText(A4[0]/2, 0.5 * inch, f"Page {doc.page}")
    canvas.drawString(inch, 0.5 * inch, f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    canvas.restoreState()

def create_documentation():
    """Create the comprehensive PDF documentation"""
    filename = "/Users/prakashgupta/workspace/Paycrypt/Paycrypt_Project_Documentation.pdf"
    doc = SimpleDocTemplate(filename, pagesize=A4, onFirstPage=create_header_footer, onLaterPages=create_header_footer)
    story = []

    # Title Page
    story.append(Paragraph("Paycrypt - Comprehensive Project Documentation", title_style))
    story.append(Spacer(1, 50))
    story.append(Paragraph("Crypto Payment Gateway SaaS Platform", heading_style))
    story.append(Paragraph(f"Generated on: {datetime.datetime.now().strftime('%B %d, %Y')}", body_style))
    story.append(PageBreak())

    # Table of Contents
    story.append(Paragraph("Table of Contents", heading_style))
    toc_content = [
        "1. Project Overview and Purpose",
        "2. Architecture and Technology Stack",
        "3. Core Features and Functionality",
        "4. API Documentation",
        "5. Application Flow and User Journeys",
        "6. Database Schema and Models",
        "7. Security and Authentication",
        "8. Deployment and Infrastructure",
        "9. Supported Cryptocurrencies and Networks",
        "10. Configuration and Environment Setup"
    ]
    
    for item in toc_content:
        story.append(Paragraph(item, body_style))
        story.append(Spacer(1, 6))
    
    story.append(PageBreak())

    # 1. Project Overview and Purpose
    story.append(Paragraph("1. Project Overview and Purpose", heading_style))
    
    overview_content = """
    Paycrypt is a comprehensive crypto-native payment gateway SaaS platform designed to enable businesses 
    to accept cryptocurrency payments seamlessly. Built as a TypeScript monorepo, it provides a complete 
    infrastructure for merchants to process, manage, and settle cryptocurrency transactions with the 
    same ease as traditional payment systems.
    
    <b>Primary Purpose:</b><br/>
    • Enable businesses to accept cryptocurrency payments without managing complex blockchain infrastructure<br/>
    • Provide a Stripe-like API experience for crypto payments<br/>
    • Support both custodial and non-custodial wallet models<br/>
    • Offer real-time payment processing and settlement<br/>
    • Provide comprehensive merchant dashboard and admin panel<br/>
    
    <b>Target Users:</b><br/>
    • E-commerce businesses seeking crypto payment options<br/>
    • Service providers wanting to expand payment methods<br/>
    • SaaS platforms requiring embedded payment solutions<br/>
    • Financial technology companies integrating crypto payments<br/>
    """
    
    story.append(Paragraph(overview_content, body_style))
    story.append(PageBreak())

    # 2. Architecture and Technology Stack
    story.append(Paragraph("2. Architecture and Technology Stack", heading_style))
    
    tech_stack_data = [
        ['Component', 'Technology', 'Purpose'],
        ['Frontend', 'Next.js 15.5.15', 'Merchant and Admin Web Interface'],
        ['API Backend', 'Express.js', 'REST API Server'],
        ['WebSocket', 'Socket.IO', 'Real-time Payment Updates'],
        ['Background Jobs', 'BullMQ', 'Payment Processing and Settlement'],
        ['Database', 'Supabase PostgreSQL', 'Primary Data Storage'],
        ['Cache/Queue', 'Redis 7', 'Caching and Job Queue'],
        ['Language', 'TypeScript', 'Type-safe Development'],
        ['Deployment', 'Vercel + AWS EC2', 'Scalable Cloud Infrastructure'],
        ['Containerization', 'Docker', 'Service Isolation'],
        ['Process Management', 'Nginx', 'Load Balancing and Reverse Proxy']
    ]
    
    tech_table = Table(tech_stack_data, colWidths=[2*inch, 2*inch, 3*inch])
    tech_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    story.append(tech_table)
    story.append(Spacer(1, 20))
    
    architecture_content = """
    <b>Monorepo Structure:</b><br/>
    The project follows a monorepo architecture with clear separation of concerns:
    
    • <b>apps/api</b>: Express.js REST API server<br/>
    • <b>apps/web</b>: Next.js frontend application<br/>
    • <b>apps/ws</b>: Socket.IO WebSocket server<br/>
    • <b>apps/worker</b>: BullMQ background job processors<br/>
    • <b>packages/shared</b>: Shared TypeScript utilities and types<br/>
    • <b>packages/sdk</b>: Node.js SDK for merchant integration<br/>
    
    <b>Service Communication:</b><br/>
    Services communicate through Redis for real-time updates and job queues, 
    while the API serves as the primary data access layer with PostgreSQL as the 
    persistent storage backend.
    """
    
    story.append(Paragraph(architecture_content, body_style))
    story.append(PageBreak())

    # 3. Core Features and Functionality
    story.append(Paragraph("3. Core Features and Functionality", heading_style))
    
    features_data = [
        ['Feature Category', 'Specific Features', 'Description'],
        ['Payment Processing', 'Payment Intents, Payment Links', 'Create and manage cryptocurrency payment requests'],
        ['Wallet Management', 'Custodial & Non-Custodial', 'Support for both managed and self-hosted wallet solutions'],
        ['Real-time Updates', 'Socket.IO Integration', 'Live payment status updates and notifications'],
        ['Merchant Dashboard', 'Analytics, Reports, Settings', 'Comprehensive merchant management interface'],
        ['Admin Panel', 'Merchant Management, Risk Monitoring', 'Platform administration and oversight tools'],
        ['API Integration', 'REST API, Webhooks, SDK', 'Developer-friendly integration options'],
        ['Security', 'JWT Auth, API Keys, Rate Limiting', 'Enterprise-grade security measures'],
        ['Settlement', 'Automated Processing, Multiple Networks', 'Flexible settlement options across blockchains'],
        ['Billing', 'Subscription Plans, Usage Tracking', 'Flexible pricing and billing management'],
        ['Compliance', 'Audit Logs, KYC Support', 'Regulatory compliance features']
    ]
    
    features_table = Table(features_data, colWidths=[1.5*inch, 2*inch, 3.5*inch])
    features_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP')
    ]))
    
    story.append(features_table)
    story.append(Spacer(1, 20))
    
    detailed_features = """
    <b>Key Differentiators:</b><br/>
    
    • <b>Dual Wallet Model:</b> Supports both custodial (managed by platform) and non-custodial 
      (merchant-controlled) wallet options, providing flexibility based on merchant preferences 
      and regulatory requirements.<br/>
    
    • <b>Real-time Processing:</b> WebSocket-based real-time updates ensure merchants and customers 
      receive immediate feedback on payment status changes.<br/>
    
    • <b>Multi-Network Support:</b> Native support for TRC20 (Tron), ERC20 (Ethereum), and Solana 
      networks, with extensible architecture for additional blockchains.<br/>
    
    • <b>Developer-Friendly:</b> Stripe-like API design, comprehensive SDK, and detailed documentation 
      for seamless integration.<br/>
    
    • <b>Enterprise Security:</b> JWT-based authentication, API key management, rate limiting, and 
      comprehensive audit logging for security compliance.<br/>
    """
    
    story.append(Paragraph(detailed_features, body_style))
    story.append(PageBreak())

    # 4. API Documentation
    story.append(Paragraph("4. API Documentation", heading_style))
    
    api_categories = [
        ['API Category', 'Base Path', 'Authentication', 'Primary Use'],
        ['Platform API', '/v1', 'API Key (sk_live_)', 'External merchant integrations'],
        ['Dashboard API', '/dashboard', 'JWT + Refresh Token', 'Merchant dashboard functionality'],
        ['Admin API', '/admin', 'JWT + Admin Role', 'Platform administration'],
        ['Auth API', '/auth', 'None (login)', 'Authentication endpoints'],
        ['Public API', '/public', 'None', 'Public payment information'],
        ['WebSocket', '/socket.io', 'JWT Token', 'Real-time updates']
    ]
    
    api_table = Table(api_categories, colWidths=[1.5*inch, 1.5*inch, 2*inch, 2*inch])
    api_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightblue),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9)
    ]))
    
    story.append(api_table)
    story.append(Spacer(1, 20))
    
    story.append(Paragraph("Platform API Endpoints", subheading_style))
    
    platform_endpoints = """
    <b>Payment Management:</b><br/>
    • POST /v1/payments - Create payment intent<br/>
    • GET /v1/payments/:id - Retrieve payment details<br/>
    • POST /v1/payment_links - Create payment link<br/>
    • GET /v1/transactions - List transactions<br/>
    
    <b>Billing and Settlement:</b><br/>
    • GET /v1/invoices - List billing invoices<br/>
    • GET /v1/settlements - List settlements<br/>
    • GET /v1/subscriptions - Get subscription info<br/>
    
    <b>Webhooks:</b><br/>
    • POST /v1/webhooks - Create webhook endpoint<br/>
    • Webhook events: payment.confirmed, payment.failed, settlement.completed<br/>
    
    <b>Authentication:</b><br/>
    • Header: Authorization: Bearer sk_live_xxx<br/>
    • Idempotency: Idempotency-Key: <unique-key><br/>
    • Rate Limiting: 120 requests/minute (configurable)<br/>
    """
    
    story.append(Paragraph(platform_endpoints, body_style))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Dashboard API Endpoints", subheading_style))
    
    dashboard_endpoints = """
    <b>Overview and Analytics:</b><br/>
    • GET /dashboard/overview - Merchant dashboard metrics<br/>
    • GET /dashboard/reports - Detailed reports and analytics<br/>
    • GET /dashboard/payments - Payment ledger<br/>
    
    <b>Wallet Management:</b><br/>
    • GET /dashboard/wallets - List merchant wallets<br/>
    • POST /dashboard/wallets - Register non-custodial wallet<br/>
    • POST /dashboard/wallets/custodial - Provision custodial wallet<br/>
    • POST /dashboard/wallets/verify - Initiate wallet verification<br/>
    
    <b>Settings and Configuration:</b><br/>
    • GET /dashboard/settings - Merchant checkout settings<br/>
    • PATCH /dashboard/settings - Update checkout preferences<br/>
    • GET /dashboard/api-keys - List API keys<br/>
    • POST /dashboard/api-keys - Create new API key pair<br/>
    
    <b>Webhooks and Integrations:</b><br/>
    • GET /dashboard/webhooks - List webhook endpoints<br/>
    • POST /dashboard/webhooks - Create webhook endpoint<br/>
    • POST /dashboard/webhooks/:id/rotate - Rotate webhook secret<br/>
    """
    
    story.append(Paragraph(dashboard_endpoints, body_style))
    story.append(PageBreak())

    # 5. Application Flow and User Journeys
    story.append(Paragraph("5. Application Flow and User Journeys", heading_style))
    
    story.append(Paragraph("Merchant Onboarding Flow", subheading_style))
    
    merchant_flow = """
    <b>Step 1: Admin Merchant Creation</b><br/>
    1. Super admin creates merchant account via admin panel<br/>
    2. System generates temporary password and sets must_change_password flag<br/>
    3. Merchant receives credentials via email<br/>
    
    <b>Step 2: First Login and Password Setup</b><br/>
    1. Merchant logs in with temporary credentials<br/>
    2. System redirects to /setup-password page<br/>
    3. Merchant sets permanent password (minimum 10 characters)<br/>
    4. System clears forced-reset flag and issues fresh JWT tokens<br/>
    5. Merchant gains access to dashboard<br/>
    
    <b>Step 3: Wallet Configuration</b><br/>
    1. Merchant chooses between custodial and non-custodial options<br/>
    2. For custodial: Provision wallets via Binance integration<br/>
    3. For non-custodial: Register existing wallet addresses<br/>
    4. System performs wallet verification process<br/>
    5. Merchant selects preferred settlement networks<br/>
    
    <b>Step 4: API Integration</b><br/>
    1. Merchant generates API key pair (public/secret)<br/>
    2. Configure webhook endpoints for real-time notifications<br/>
    3. Test integration with payment preview functionality<br/>
    4. Go live with production API keys<br/>
    """
    
    story.append(Paragraph(merchant_flow, body_style))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Payment Processing Flow", subheading_style))
    
    payment_flow = """
    <b>Step 1: Payment Intent Creation</b><br/>
    1. Merchant creates payment intent via API or dashboard<br/>
    2. System determines optimal wallet route and pricing<br/>
    3. Payment intent is stored with unique ID and expiration<br/>
    4. QR code and payment details are generated<br/>
    
    <b>Step 2: Customer Payment</b><br/>
    1. Customer accesses hosted checkout page (/pay/[id])<br/>
    2. System displays payment details and QR code<br/>
    3. Customer initiates cryptocurrency transfer<br/>
    4. WebSocket connection established for real-time updates<br/>
    
    <b>Step 3: Transaction Monitoring</b><br/>
    1. Background workers monitor blockchain for transaction confirmation<br/>
    2. System validates transaction amount and recipient<br/>
    3. Payment status updated in real-time via WebSocket<br/>
    4. Customer and merchant receive immediate notifications<br/>
    
    <b>Step 4: Settlement Processing</b><br/>
    1. Confirmed transactions queued for settlement<br/>
    2. System processes settlement based on merchant preferences<br/>
    3. Funds transferred to merchant settlement addresses<br/>
    4. Webhook notifications sent for settlement completion<br/>
    5. Transaction records updated in merchant ledger<br/>
    """
    
    story.append(Paragraph(payment_flow, body_style))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Admin Management Flow", subheading_style))
    
    admin_flow = """
    <b>Merchant Lifecycle Management:</b><br/>
    • Create new merchant accounts with plan assignments<br/>
    • Update merchant information and status<br/>
    • Suspend or terminate merchant accounts<br/>
    • Manage merchant subscription plans and billing<br/>
    
    <b>Risk and Compliance Monitoring:</b><br/>
    • Monitor transaction volumes and patterns<br/>
    • Review wallet verification requests<br/>
    • Track system performance and queue health<br/>
    • Manage system alerts and notifications<br/>
    
    <b>Platform Operations:</b><br/>
    • Monitor custodial wallet balances (Binance integration)<br/>
    • Review settlement processing and fund movements<br/>
    • Analyze platform revenue and metrics<br/>
    • Manage system configuration and feature flags<br/>
    """
    
    story.append(Paragraph(admin_flow, body_style))
    story.append(PageBreak())

    # 6. Database Schema and Models
    story.append(Paragraph("6. Database Schema and Models", heading_style))
    
    schema_content = """
    Paycrypt uses Supabase PostgreSQL as its primary database with a comprehensive schema 
    designed to support multi-tenant architecture with proper isolation and security.
    
    <b>Core Tables:</b><br/>
    
    • <b>merchants</b>: Primary merchant accounts with billing and configuration<br/>
    • <b>users</b>: User accounts linked to merchants with role-based access<br/>
    • <b>payments</b>: Payment intents and transaction records<br/>
    • <b>transactions</b>: Blockchain transaction details and confirmations<br/>
    • <b>wallets</b>: Merchant wallet configurations (custodial/non-custodial)<br/>
    • <b>settlements</b>: Settlement processing records and status<br/>
    • <b>api_keys</b>: Merchant API key management with scopes and rate limits<br/>
    • <b>webhook_endpoints</b>: Webhook configurations and event subscriptions<br/>
    • <b>subscriptions</b>: Merchant subscription plans and billing details<br/>
    • <b>billing_invoices</b>: Invoice generation and payment tracking<br/>
    """
    
    story.append(Paragraph(schema_content, body_style))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("Key Relationships and Constraints", subheading_style))
    
    relationships = """
    <b>Multi-Tenant Isolation:</b><br/>
    • All merchant data isolated by merchant_id foreign keys<br/>
    • Row-level security policies ensure data isolation<br/>
    • Audit logging tracks all data modifications<br/>
    
    <b>Payment Flow Relationships:</b><br/>
    • payments → transactions (one-to-many for blockchain events)<br/>
    • payments → settlements (one-to-one for settlement processing)<br/>
    • wallets → payments (many-to-many for payment routing)<br/>
    
    <b>User Access Control:</b><br/>
    • users → merchants (many-to-one for merchant assignment)<br/>
    • api_keys → merchants (many-to-one for API access)<br/>
    • webhook_endpoints → merchants (many-to-one for webhooks)<br/>
    
    <b>Billing and Subscriptions:</b><br/>
    • merchants → subscriptions (one-to-one for active plan)<br/>
    • subscriptions → billing_invoices (one-to-many for billing)<br/>
    """
    
    story.append(Paragraph(relationships, body_style))
    story.append(PageBreak())

    # 7. Security and Authentication
    story.append(Paragraph("7. Security and Authentication", heading_style))
    
    security_data = [
        ['Security Layer', 'Implementation', 'Purpose'],
        ['Authentication', 'JWT Access + Refresh Tokens', 'Secure user session management'],
        ['API Security', 'API Keys with Scopes', 'Programmatic access control'],
        ['Rate Limiting', 'Redis-based Rate Limiting', 'Prevent abuse and ensure stability'],
        ['Data Encryption', 'Field-level Encryption', 'Protect sensitive data at rest'],
        ['Audit Logging', 'Comprehensive Audit Trail', 'Track all system actions'],
        ['Webhook Security', 'HMAC Signature Verification', 'Secure webhook delivery'],
        ['Network Security', 'HTTPS/WSS Only', 'Encrypt all network communications'],
        ['Input Validation', 'Strict Input Sanitization', 'Prevent injection attacks'],
        ['Password Security', 'bcrypt Hashing', 'Secure password storage'],
        ['Session Management', 'HttpOnly Cookies', 'Prevent session hijacking']
    ]
    
    security_table = Table(security_data, colWidths=[1.8*inch, 2.2*inch, 2*inch])
    security_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightcoral),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP')
    ]))
    
    story.append(security_table)
    story.append(Spacer(1, 20))
    
    auth_details = """
    <b>JWT Token Structure:</b><br/>
    • Access Tokens: Short-lived (15 minutes) for API requests<br/>
    • Refresh Tokens: Long-lived (30 days) stored in HttpOnly cookies<br/>
    • Token Payload: User ID, merchant ID, role, and permissions<br/>
    
    <b>API Key Management:</b><br/>
    • Public Keys (pk_live_): Read-only operations<br/>
    • Secret Keys (sk_live_): Full access operations<br/>
    • Scopes: payments:read, payments:write, webhooks:write, etc.<br/>
    • Rate Limits: Configurable per key (default: 120/minute)<br/>
    
    <b>Security Best Practices:</b><br/>
    • All passwords hashed with bcrypt (cost factor: 12)<br/>
    • Sensitive data encrypted at rest using AES-256<br/>
    • Regular security audits and penetration testing<br/>
    • Compliance with PCI DSS and GDPR requirements<br/>
    """
    
    story.append(Paragraph(auth_details, body_style))
    story.append(PageBreak())

    # 8. Deployment and Infrastructure
    story.append(Paragraph("8. Deployment and Infrastructure", heading_style))
    
    deployment_content = """
    Paycrypt employs a modern, scalable cloud infrastructure designed for high availability 
    and performance across global markets.
    
    <b>Frontend Deployment:</b><br/>
    • Platform: Vercel (Edge Network)<br/>
    • Project: paycrypt-web-live<br/>
    • Global CDN: Automatic edge distribution<br/>
    • Environment: Production and preview deployments<br/>
    
    <b>Backend Deployment:</b><br/>
    • Platform: AWS EC2 (ap-south-1 region)<<br/>
    • Services: API, WebSocket, Worker, Redis<br/>
    • Load Balancer: Nginx with SSL termination<br/>
    • Monitoring: Custom health checks and telemetry<br/>
    
    <b>Database Infrastructure:</b><br/>
    • Platform: Supabase (PostgreSQL)<br/>
    • Region: Global with automatic failover<br/>
    • Backups: Automated daily backups with point-in-time recovery<br/>
    • Migrations: Version-controlled schema migrations<br/>
    """
    
    story.append(Paragraph(deployment_content, body_style))
    story.append(Spacer(1, 15))
    
    infrastructure_data = [
        ['Component', 'Provider', 'Configuration', 'Monitoring'],
        ['Frontend', 'Vercel', 'Edge Network, Auto-scaling', 'Real-time logs, Analytics'],
        ['API Server', 'AWS EC2', 't3.medium, Auto-scaling', 'Health checks, Metrics'],
        ['WebSocket', 'AWS EC2', 't3.small, Redis cluster', 'Latency monitoring'],
        ['Worker', 'AWS EC2', 't3.medium, Queue monitoring', 'Job processing metrics'],
        ['Database', 'Supabase', 'Managed PostgreSQL', 'Performance monitoring'],
        ['Cache/Queue', 'Redis', 'Cluster mode, Persistence', 'Memory usage, Latency'],
        ['CDN', 'CloudFront', 'Edge distribution', 'Cache hit ratios'],
        ['DNS', 'Route 53', 'Health checks, Failover', 'Uptime monitoring']
    ]
    
    infra_table = Table(infrastructure_data, colWidths=[1.5*inch, 1.2*inch, 1.8*inch, 1.5*inch])
    infra_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightblue),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP')
    ]))
    
    story.append(infra_table)
    story.append(Spacer(1, 15))
    
    deployment_details = """
    <b>Environment Configuration:</b><br/>
    • Development: Local Docker Compose setup<br/>
    • Staging: Mirror of production with test data<br/>
    • Production: Full-scale deployment with monitoring<br/>
    
    <b>CI/CD Pipeline:</b><br/>
    • Frontend: Automatic Vercel deployment on main branch<br/>
    • Backend: Manual deployment with health checks<br/>
    • Database: Automated migration execution<br/>
    • Monitoring: Post-deployment verification<br/>
    
    <b>Monitoring and Observability:</b><br/>
    • Application metrics: Custom telemetry collection<br/>
    • Infrastructure: AWS CloudWatch integration<br/>
    • Error tracking: Comprehensive error logging<br/>
    • Performance: Response time and throughput monitoring<br/>
    """
    
    story.append(Paragraph(deployment_details, body_style))
    story.append(PageBreak())

    # 9. Supported Cryptocurrencies and Networks
    story.append(Paragraph("9. Supported Cryptocurrencies and Networks", heading_style))
    
    crypto_data = [
        ['Asset', 'Networks', 'Settlement Currency', 'Wallet Type'],
        ['Bitcoin (BTC)', 'Bitcoin', 'BTC', 'Custodial Only'],
        ['Ethereum (ETH)', 'ERC20', 'ETH', 'Custodial Only'],
        ['Tether (USDT)', 'TRC20, ERC20, SOL', 'USDT', 'Both'],
        ['USDC', 'ERC20, SOL', 'USDC', 'Both'],
        ['Other ERC20', 'ERC20', 'Various', 'Non-Custodial'],
        ['Solana Tokens', 'Solana', 'Various', 'Non-Custodial'],
        ['TRC20 Tokens', 'TRC20', 'Various', 'Non-Custodial']
    ]
    
    crypto_table = Table(crypto_data, colWidths=[1.5*inch, 2*inch, 1.5*inch, 1.5*inch])
    crypto_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightgreen),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 9)
    ]))
    
    story.append(crypto_table)
    story.append(Spacer(1, 20))
    
    network_details = """
    <b>Network Infrastructure:</b><br/>
    
    <b>Tron (TRC20):</b><br/>
    • RPC Endpoint: https://api.trongrid.io<br/>
    • Confirmation Time: ~1-2 minutes<br/>
    • Fees: Minimal TRX gas fees<br/>
    • Popular for: USDT transfers<br/>
    
    <b>Ethereum (ERC20):</b><br/>
    • RPC Endpoint: https://rpc.ankr.com/eth<br/>
    • Confirmation Time: ~15-30 minutes (depending on gas)<br/>
    • Fees: Variable gas fees<br/>
    • Popular for: USDC, DAI, other stablecoins<br/>
    
    <b>Solana:</b><br/>
    • RPC Endpoint: https://api.mainnet-beta.solana.com<br/>
    • Confirmation Time: ~2-3 seconds<br/>
    • Fees: Minimal SOL fees<br/>
    • Popular for: USDC, SOL, SPL tokens<br/>
    
    <b>Bitcoin:</b><br/>
    • Native Bitcoin network<br/>
    • Confirmation Time: ~60 minutes<br/>
    • Fees: Variable network fees<br/>
    • Custodial only: Managed through Binance integration<br/>
    """
    
    story.append(Paragraph(network_details, body_style))
    story.append(Spacer(1, 15))
    
    settlement_info = """
    <b>Settlement Processing:</b><br/>
    
    • <b>Real-time Processing:</b> Immediate settlement for supported networks<br/>
    • <b>Batch Processing:</b> Periodic settlement for high-volume transactions<br/>
    • <b>Multi-currency Support:</b> Settlement in original or converted currency<br/>
    • <b>Network Optimization:</b> Automatic routing to lowest-fee networks<br/>
    
    <b>Price Oracle Integration:</b><br/>
    • Source: CoinGecko API<br/>
    • Update Frequency: Every 5 minutes<br/>
    • Pairs: 50+ cryptocurrency/fiat pairs<br/>
    • Fallback: Multiple oracle providers for reliability<br/>
    """
    
    story.append(Paragraph(settlement_info, body_style))
    story.append(PageBreak())

    # 10. Configuration and Environment Setup
    story.append(Paragraph("10. Configuration and Environment Setup", heading_style))
    
    env_vars_data = [
        ['Category', 'Environment Variable', 'Purpose', 'Example'],
        ['Application', 'NODE_ENV', 'Environment mode', 'development'],
        ['Application', 'PORT', 'API server port', '4000'],
        ['Application', 'WS_PORT', 'WebSocket port', '4001'],
        ['Database', 'DATABASE_URL', 'PostgreSQL connection', 'postgresql://...'],
        ['Database', 'SUPABASE_URL', 'Supabase project URL', 'https://...'],
        ['Database', 'SUPABASE_SERVICE_ROLE_KEY', 'Supabase admin key', 'service-role-key'],
        ['Security', 'JWT_ACCESS_SECRET', 'JWT signing secret', 'strong-secret'],
        ['Security', 'JWT_REFRESH_SECRET', 'Refresh token secret', 'strong-secret'],
        ['Security', 'WEBHOOK_SIGNING_SECRET', 'Webhook HMAC secret', 'webhook-secret'],
        ['Security', 'ENCRYPTION_KEY', 'Data encryption key', 'base64-key'],
        ['External', 'REDIS_URL', 'Redis connection', 'redis://localhost:6379'],
        ['External', 'BINANCE_API_KEY', 'Binance API key', 'api-key'],
        ['External', 'BINANCE_API_SECRET', 'Binance secret', 'api-secret'],
        ['External', 'ETHEREUM_RPC_URL', 'Ethereum RPC', 'https://rpc.ankr.com/eth'],
        ['External', 'SOLANA_RPC_URL', 'Solana RPC', 'https://api.mainnet-beta.solana.com'],
        ['External', 'PRICE_ORACLE_BASE_URL', 'Price oracle', 'https://api.coingecko.com']
    ]
    
    env_table = Table(env_vars_data, colWidths=[1.2*inch, 1.5*inch, 2*inch, 1.8*inch])
    env_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'TOP')
    ]))
    
    story.append(env_table)
    story.append(Spacer(1, 20))
    
    setup_instructions = """
    <b>Local Development Setup:</b><br/>
    
    <b>Prerequisites:</b><br/>
    • Node.js 18+ and npm<br/>
    • Docker and Docker Compose<br/>
    • PostgreSQL client tools<br/>
    • Redis server<br/>
    
    <b>Setup Steps:</b><br/>
    1. Clone repository and navigate to root directory<br/>
    2. Copy .env.example to .env and configure variables<br/>
    3. Install dependencies: npm install<br/>
    4. Run database migrations: npm run migrate:db<br/>
    5. Seed demo data: npm run seed:demo<br/>
    6. Start services: npm run dev:api, npm run dev:ws, npm run dev:web<br/>
    
    <b>Service URLs:</b><br/>
    • Frontend: http://localhost:3003<br/>
    • API: http://localhost:4000<br/>
    • WebSocket: http://localhost:4001<br/>
    • Redis: localhost:6379<br/>
    
    <b>Docker Development:</b><br/>
    • Use docker-compose.yml for full stack development<br/>
    • Includes nginx, redis, and all application services<br/>
    • Automatic health checks and service dependencies<br/>
    • Volume mounts for live code reloading<br/>
    """
    
    story.append(Paragraph(setup_instructions, body_style))
    story.append(Spacer(1, 15))
    
    production_config = """
    <b>Production Configuration:</b><br/>
    
    <b>Security Requirements:</b><br/>
    • All secrets must be strong and unique<br/>
    • HTTPS/WSS required for all communications<br/>
    • Regular key rotation recommended<br/>
    • Environment variables should be managed securely<br/>
    
    <b>Performance Optimization:</b><br/>
    • Redis cluster for high availability<br/>
    • Database connection pooling<br/>
    • CDN configuration for static assets<br/>
    • Load balancing for API services<br/>
    
    <b>Monitoring and Logging:</b><br/>
    • Structured logging with correlation IDs<br/>
    • Performance metrics collection<br/>
    • Error tracking and alerting<br/>
    • Health check endpoints<br/>
    
    <b>Backup and Recovery:</b><br/>
    • Automated database backups<br/>
    • Configuration version control<br/>
    • Disaster recovery procedures<br/>
    • Regular restore testing<br/>
    """
    
    story.append(Paragraph(production_config, body_style))
    story.append(Spacer(1, 20))
    
    # Conclusion
    story.append(Paragraph("Conclusion", heading_style))
    
    conclusion = """
    Paycrypt represents a comprehensive, enterprise-grade solution for cryptocurrency payment processing. 
    Its architecture combines modern web technologies with robust security practices and scalable 
    infrastructure design.
    
    <b>Key Strengths:</b><br/>
    • Comprehensive feature set covering all aspects of crypto payment processing<br/>
    • Flexible architecture supporting both custodial and non-custodial models<br/>
    • Developer-friendly API design with extensive documentation and SDK support<br/>
    • Enterprise-grade security with proper authentication and authorization<br/>
    • Scalable infrastructure designed for global deployment<br/>
    • Real-time processing capabilities enhancing user experience<br/>
    • Extensive monitoring and observability features<br/>
    
    <b>Future Enhancements:</b><br/>
    • Additional blockchain network support<br/>
    • Advanced fraud detection and risk management<br/>
    • Enhanced analytics and reporting capabilities<br/>
    • Mobile SDK development<br/>
    • DeFi protocol integration<br/>
    
    This platform provides a solid foundation for businesses seeking to integrate cryptocurrency 
    payments into their operations while maintaining security, compliance, and user experience standards.
    """
    
    story.append(Paragraph(conclusion, body_style))
    
    # Build the PDF
    doc.build(story)
    print(f"PDF documentation generated: {filename}")

if __name__ == "__main__":
    create_documentation()
