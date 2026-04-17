-- ============================================================
-- Migration: 002_leads.sql
-- Description: Creates the leads table for Aviv Iasso Law Firm
--              contact form submissions with RLS policies.
-- ============================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: leads
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Contact information
  full_name     TEXT          NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  phone         TEXT          NOT NULL CHECK (char_length(phone) BETWEEN 9 AND 20),
  email         TEXT          CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- Inquiry details
  inquiry_type  TEXT          NOT NULL CHECK (
    inquiry_type IN (
      'commercial_law',
      'real_estate',
      'litigation',
      'employment',
      'family_law',
      'criminal_law',
      'intellectual_property',
      'tax_law',
      'general_consultation',
      'other'
    )
  ),
  message       TEXT          CHECK (message IS NULL OR char_length(message) <= 2000),

  -- Tracking metadata
  source        TEXT          DEFAULT 'landing_page' CHECK (char_length(source) <= 100),
  ip_address    INET,
  user_agent    TEXT          CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),

  -- CRM status fields
  status        TEXT          NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'contacted', 'qualified', 'converted', 'closed', 'spam')
  ),
  notes         TEXT,
  assigned_to   TEXT
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS leads_created_at_idx
  ON public.leads (created_at DESC);

CREATE INDEX IF NOT EXISTS leads_status_idx
  ON public.leads (status);

CREATE INDEX IF NOT EXISTS leads_inquiry_type_idx
  ON public.leads (inquiry_type);

CREATE INDEX IF NOT EXISTS leads_phone_idx
  ON public.leads (phone);

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow idempotent re-runs
DROP POLICY IF EXISTS "leads_insert_anon" ON public.leads;
DROP POLICY IF EXISTS "leads_select_service_role" ON public.leads;
DROP POLICY IF EXISTS "leads_update_service_role" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_service_role" ON public.leads;

-- Allow anonymous users (public web visitors) to INSERT only
-- No SELECT, UPDATE, or DELETE for anon role
CREATE POLICY "leads_insert_anon"
  ON public.leads
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Basic sanity checks at policy level (Zod handles full validation)
    char_length(full_name) >= 2
    AND char_length(phone) >= 9
    AND inquiry_type IS NOT NULL
  );

-- Allow service_role (admin) full read access
CREATE POLICY "leads_select_service_role"
  ON public.leads
  FOR SELECT
  TO service_role
  USING (true);

-- Allow service_role to update CRM status fields
CREATE POLICY "leads_update_service_role"
  ON public.leads
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service_role to hard-delete spam entries
CREATE POLICY "leads_delete_service_role"
  ON public.leads
  FOR DELETE
  TO service_role
  USING (true);

-- ============================================================
-- Grants
-- ============================================================
GRANT INSERT ON public.leads TO anon;
GRANT ALL ON public.leads TO service_role;

-- Allow anon to use the sequence for id (uuid, no sequence needed)
-- Explicit grant for safety
GRANT USAGE ON SCHEMA public TO anon;

-- ============================================================
-- Comments for documentation
-- ============================================================
COMMENT ON TABLE public.leads IS
  'Contact form submissions from the Aviv Iasso Law Firm landing page. '
  'Anonymous inserts are permitted via RLS; reads restricted to service_role.';

COMMENT ON COLUMN public.leads.inquiry_type IS
  'Legal service category selected by the prospective client.';

COMMENT ON COLUMN public.leads.status IS
  'CRM pipeline status: new → contacted → qualified → converted | closed | spam';

COMMENT ON COLUMN public.leads.ip_address IS
  'Client IP address recorded for spam detection. Handle per GDPR/Israeli privacy law.';
