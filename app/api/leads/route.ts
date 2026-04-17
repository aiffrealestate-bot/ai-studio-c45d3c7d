import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { leadSchema } from '@/lib/validation';
import { ZodError } from 'zod';

export const runtime = 'nodejs';

// Simple in-memory rate limit store (per-IP, resets per cold start)
// For production, replace with Redis / Upstash
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_MAX = 5;       // max requests
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function getRateLimitHeaders(
  remaining: number,
  resetAt: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
    'X-RateLimit-Policy': `${RATE_LIMIT_MAX};w=${RATE_LIMIT_WINDOW / 1000}`,
  };
}

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW;
    rateLimitStore.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - record.count,
    resetAt: record.resetAt,
  };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get('user-agent') ?? null;

  // --- Rate limiting ---
  const { allowed, remaining, resetAt } = checkRateLimit(clientIp);
  const rateLimitHeaders = getRateLimitHeaders(remaining, resetAt);

  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'יותר מדי פניות. אנא נסה שוב מאוחר יותר.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
      { status: 429, headers: { ...rateLimitHeaders, 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }

  // --- Parse request body ---
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'גוף הבקשה אינו JSON תקין.',
        code: 'INVALID_JSON',
      },
      { status: 400, headers: rateLimitHeaders }
    );
  }

  // --- Zod validation ---
  let validatedData: ReturnType<typeof leadSchema.parse>;
  try {
    validatedData = leadSchema.parse(rawBody);
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors = err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        {
          success: false,
          error: 'נתונים לא תקינים. אנא בדוק את הטופס ונסה שוב.',
          code: 'VALIDATION_ERROR',
          details: fieldErrors,
        },
        { status: 422, headers: rateLimitHeaders }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: 'שגיאת אימות לא צפויה.',
        code: 'UNKNOWN_VALIDATION_ERROR',
      },
      { status: 422, headers: rateLimitHeaders }
    );
  }

  // --- Supabase insert (RLS-protected via anon key) ---
  const supabase = getSupabaseClient();

  const insertPayload = {
    full_name: validatedData.full_name,
    phone: validatedData.phone,
    email: validatedData.email ?? null,
    inquiry_type: validatedData.inquiry_type,
    message: validatedData.message ?? null,
    source: validatedData.source ?? 'landing_page',
    ip_address: clientIp === 'unknown' ? null : clientIp,
    user_agent: userAgent,
  };

  const { data, error } = await supabase
    .from('leads')
    .insert(insertPayload)
    .select('id, created_at')
    .single();

  if (error) {
    console.error('[leads/route] Supabase insert error:', {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });

    // Detect duplicate phone within short window (optional unique constraint)
    if (error.code === '23505') {
      return NextResponse.json(
        {
          success: false,
          error: 'פנייה ממספר זה כבר התקבלה. נחזור אליך בקרוב.',
          code: 'DUPLICATE_LEAD',
        },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'שגיאה בשמירת הפנייה. אנא נסה שוב או צור קשר טלפוני.',
        code: 'DB_INSERT_ERROR',
      },
      { status: 500, headers: rateLimitHeaders }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: 'פנייתך התקבלה בהצלחה. צוות משרד עו"ד אביב יאסו יצור איתך קשר בהקדם.',
      data: {
        id: data.id,
        created_at: data.created_at,
      },
    },
    {
      status: 201,
      headers: {
        ...rateLimitHeaders,
        'Cache-Control': 'no-store',
      },
    }
  );
}

// Reject non-POST methods explicitly
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
