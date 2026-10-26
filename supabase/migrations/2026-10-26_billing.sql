-- StaffList: Stripe billing for Solo and Pro. Run once in Supabase → SQL Editor (safe to run again).
--
--  • Each team (church) can have one Stripe subscription. The Stripe webhook (api/stripe-webhook.js)
--    is the only thing that changes churches.plan and the billing columns; it uses the service-role
--    key, so people can't set their own plan (authenticated users may still only update `name`).
--  • church_billing() lets a team's Admins see their subscription status in Settings.

begin;

alter table public.churches add column if not exists stripe_customer_id     text;
alter table public.churches add column if not exists stripe_subscription_id text;
alter table public.churches add column if not exists billing_status         text;        -- Stripe status: active, trialing, past_due, canceled…
alter table public.churches add column if not exists billing_interval       text;        -- month / year
alter table public.churches add column if not exists current_period_end     timestamptz; -- renews (or ends) on
alter table public.churches add column if not exists cancel_at_period_end   boolean not null default false;

create unique index if not exists churches_stripe_customer_idx     on public.churches (stripe_customer_id)     where stripe_customer_id is not null;
create unique index if not exists churches_stripe_subscription_idx on public.churches (stripe_subscription_id) where stripe_subscription_id is not null;

-- Keep plan changes to the server: authenticated users can only rename their church.
revoke update on public.churches from authenticated;
grant update (name) on public.churches to authenticated;

-- Billing details for the team's Admins (null for anyone else).
create or replace function public.church_billing(p_church uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.sl_is_admin(c.id) then jsonb_build_object(
           'plan', c.plan,
           'status', c.billing_status,
           'interval', c.billing_interval,
           'current_period_end', c.current_period_end,
           'cancel_at_period_end', c.cancel_at_period_end,
           'has_customer', c.stripe_customer_id is not null)
         end
    from public.churches c where c.id = p_church
$$;
grant execute on function public.church_billing(uuid) to authenticated;

commit;
