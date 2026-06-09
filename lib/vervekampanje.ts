export function prisForMedlemskapstype(type: string | null | undefined) {
  if (type === "stotte") return 300
  if (type === "bedrift") return 1000
  return 100
}

export function labelForMedlemskapstype(type: string | null | undefined) {
  if (type === "stotte") return "Støttemedlem"
  if (type === "bedrift") return "Bedriftsmedlem"
  return "Medlem"
}

export function normalizeMedlemskapstype(type: string | null | undefined) {
  const value = String(type ?? "").trim().toLowerCase()
  if (value === "stotte") return "stotte"
  if (value === "bedrift") return "bedrift"
  return "innmeldt"
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export function parseMemberIdValue(value: string) {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

export function isCampaignActive(campaign: {
  status?: string | null
  starts_at?: string | null
  ends_at?: string | null
}) {
  const status = String(campaign.status ?? "").trim().toLowerCase()
  if (status !== "active") return false

  const now = Date.now()
  const startsAt = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null
  const endsAt = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null

  if (startsAt != null && Number.isFinite(startsAt) && startsAt > now) return false
  if (endsAt != null && Number.isFinite(endsAt) && endsAt < now) return false
  return true
}

export function vervekampanjeSchemaFeil(msg?: string) {
  const text = String(msg ?? "")
  if (!/relation|table|column|does not exist/i.test(text)) return null

  return (
    "Vervekampanje mangler i Supabase. Kjor denne SQL-en i Supabase (SQL Editor), og prov igjen:\n\n" +
    "create table if not exists public.vervekampanjer (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  updated_at timestamptz not null default now(),\n" +
    "  title text not null,\n" +
    "  description text,\n" +
    "  status text not null default 'active',\n" +
    "  starts_at timestamptz,\n" +
    "  ends_at timestamptz,\n" +
    "  created_by_epost text,\n" +
    "  stopped_at timestamptz,\n" +
    "  stopped_by_epost text,\n" +
    "  winning_metric text not null default 'revenue'\n" +
    ");\n" +
    "create index if not exists vervekampanjer_status_idx on public.vervekampanjer (status, created_at desc);\n" +
    "create table if not exists public.vervekampanje_premier (\n" +
    "  campaign_id uuid not null references public.vervekampanjer(id) on delete cascade,\n" +
    "  premie_id uuid not null references public.lodd_premier(id) on delete cascade,\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  reserved_by_epost text,\n" +
    "  primary key (campaign_id, premie_id)\n" +
    ");\n" +
    "create index if not exists vervekampanje_premier_created_idx on public.vervekampanje_premier (created_at desc);\n" +
    "create table if not exists public.vervekampanje_verv (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  campaign_id uuid not null references public.vervekampanjer(id) on delete cascade,\n" +
    "  referrer_member_id text not null,\n" +
    "  referrer_user_id uuid,\n" +
    "  referrer_name text,\n" +
    "  referrer_email text,\n" +
    "  referred_member_id text not null,\n" +
    "  referred_user_id uuid,\n" +
    "  referred_name text,\n" +
    "  referred_email text,\n" +
    "  membership_type text,\n" +
    "  amount numeric not null default 0,\n" +
    "  unique (campaign_id, referred_member_id)\n" +
    ");\n" +
    "create index if not exists vervekampanje_verv_campaign_idx on public.vervekampanje_verv (campaign_id, created_at desc);\n" +
    "create index if not exists vervekampanje_verv_referrer_idx on public.vervekampanje_verv (campaign_id, referrer_member_id, created_at desc);\n"
  )
}
