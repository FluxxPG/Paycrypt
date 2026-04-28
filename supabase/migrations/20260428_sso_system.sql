-- SSO System Migration
-- Implements Single Sign-On for dashboard and plugin integrations

-- SSO applications table - registers external applications
create table if not exists sso_applications (
  id uuid primary key default gen_random_uuid(),
  app_name text not null,
  app_type text not null check (app_type in ('shopify', 'woocommerce', 'wordpress', 'opencart', 'custom')),
  client_id text not null unique,
  client_secret_hash text not null,
  redirect_uris text[] not null default '{}',
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  merchant_id text references merchants(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SSO authorization codes table - for OAuth2 authorization code flow
create table if not exists sso_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id text not null,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- SSO access tokens table - for OAuth2 access tokens
create table if not exists sso_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  client_id text not null,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- SSO refresh tokens table - for OAuth2 refresh tokens
create table if not exists sso_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  access_token_id uuid references sso_access_tokens(id) on delete cascade,
  client_id text not null,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- SSO sessions table - for session management
create table if not exists sso_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  client_id text,
  ip_address text,
  user_agent text,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Indexes for SSO tables
create index if not exists sso_applications_client_id_idx on sso_applications(client_id);
create index if not exists sso_applications_merchant_idx on sso_applications(merchant_id);
create index if not exists sso_authorization_codes_code_idx on sso_authorization_codes(code);
create index if not exists sso_authorization_codes_client_idx on sso_authorization_codes(client_id, merchant_id);
create index if not exists sso_access_tokens_token_idx on sso_access_tokens(token_hash);
create index if not exists sso_access_tokens_client_idx on sso_access_tokens(client_id, merchant_id);
create index if not exists sso_refresh_tokens_token_idx on sso_refresh_tokens(token_hash);
create index if not exists sso_refresh_tokens_access_idx on sso_refresh_tokens(access_token_id);
create index if not exists sso_sessions_session_id_idx on sso_sessions(session_id);
create index if not exists sso_sessions_merchant_idx on sso_sessions(merchant_id, user_id);
create index if not exists sso_sessions_expires_idx on sso_sessions(expires_at);

-- Add triggers for updated_at
create trigger sso_applications_updated_at
  before update on sso_applications
  for each row
  execute procedure update_updated_at_column();

-- Insert default SSO application for internal use
insert into sso_applications (
  app_name, app_type, client_id, client_secret_hash, redirect_uris, scopes, is_active, metadata
) values (
  'Paycrypt Dashboard',
  'custom',
  'paycrypt_dashboard',
  crypt('paycrypt_dashboard_secret', gen_salt('bf')),
  array['http://localhost:3000/auth/callback', 'https://paycrypt-web-live.vercel.app/auth/callback'],
  array['read:payments', 'write:payments', 'read:wallets', 'write:wallets', 'read:treasury', 'write:treasury'],
  true,
  '{"internal": true, "description": "Internal dashboard application"}'::jsonb
) on conflict (client_id) do nothing;
