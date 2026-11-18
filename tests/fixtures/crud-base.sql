-- Synthetic schema matching the production column types; contains no production records.
create table if not exists public.users (
  "id" text primary key,
  "email" text,
  "photoURL" text,
  "uid" text,
  "createdAt" jsonb,
  "displayName" text,
  "username" text,
  "lastLogin" jsonb,
  "firestore_id" text,
  "tokens" jsonb,
  "auth_user_id" uuid
);
alter table public.users enable row level security;
create table if not exists public.qrcodes (
  "id" text primary key,
  "guid" text,
  "isUsed" boolean,
  "dateCreated" jsonb,
  "order_key" text,
  "product_id" numeric,
  "firestore_id" text,
  "qrcodeId" text,
  "field" text,
  "date_paid" text,
  "dateUsed" jsonb,
  "binId" jsonb,
  "userId" text
);
alter table public.qrcodes enable row level security;
create table if not exists public.shared_access (
  "id" text primary key,
  "ownerUserId" text,
  "grantedUserId" text,
  "createdAt" text,
  "firestore_id" text
);
alter table public.shared_access enable row level security;
create table if not exists public.subscriptions (
  "id" text primary key,
  "userId" text,
  "planId" text,
  "status" text,
  "createdAt" text,
  "userEmail" text,
  "firestore_id" text,
  "updatedAt" text,
  "couponUsed" jsonb,
  "stripeSubscriptionId" text,
  "stripeCustomerId" text,
  "paymentMethod" text,
  "originalPrice" numeric,
  "finalPrice" numeric,
  "discountAmount" numeric,
  "billingDetails" jsonb
);
alter table public.subscriptions enable row level security;
create table if not exists public.user_tokens (
  "id" text primary key,
  "tokens" numeric,
  "createdAt" jsonb,
  "updatedAt" jsonb,
  "firestore_id" text
);
alter table public.user_tokens enable row level security;
create table if not exists public.token_purchases (
  "id" text primary key default (gen_random_uuid())::text,
  "userId" text,
  "packageId" text,
  "tokenAmount" integer,
  "status" text,
  "createdAt" text,
  "userEmail" text
);
alter table public.token_purchases enable row level security;
