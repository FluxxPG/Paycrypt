alter table if exists users
  add column if not exists must_change_password boolean not null default false;

alter table if exists users
  add column if not exists password_setup_completed_at timestamptz;
