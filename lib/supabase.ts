import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

// Public client — uses anon key, subject to RLS
let publicClientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!publicClientInstance) {
    publicClientInstance = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return publicClientInstance;
}

// Admin client — uses service role key, bypasses RLS
// Only instantiate server-side; never expose to the browser
let adminClientInstance: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!adminClientInstance) {
    adminClientInstance = createClient(supabaseUrl!, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClientInstance;
}

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          created_at: string;
          full_name: string;
          phone: string;
          email: string | null;
          inquiry_type: string;
          message: string | null;
          source: string | null;
          ip_address: string | null;
          user_agent: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          full_name: string;
          phone: string;
          email?: string | null;
          inquiry_type: string;
          message?: string | null;
          source?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
      };
    };
  };
};
