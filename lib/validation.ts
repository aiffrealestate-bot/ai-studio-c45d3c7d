import { z } from 'zod';

// Allowed inquiry types matching the Hebrew law firm context
export const INQUIRY_TYPES = [
  'commercial_law',
  'real_estate',
  'litigation',
  'employment',
  'family_law',
  'criminal_law',
  'intellectual_property',
  'tax_law',
  'general_consultation',
  'other',
] as const;

export type InquiryType = (typeof INQUIRY_TYPES)[number];

// Israeli phone number regex — supports formats:
// 05X-XXXXXXX, +9725XXXXXXXX, 0X-XXXXXXX
const israeliPhoneRegex =
  /^(?:\+972|972|0)(?:[23489]|5[012345689]|7[0-9])[\s\-]?\d{7}$/;

export const leadSchema = z.object({
  full_name: z
    .string()
    .min(2, 'שם מלא חייב להכיל לפחות 2 תווים')
    .max(100, 'שם מלא ארוך מדי')
    .trim()
    .regex(
      /^[\u0590-\u05FFa-zA-Z\s'"\-\.]+$/,
      'שם מלא מכיל תווים לא חוקיים'
    ),

  phone: z
    .string()
    .min(9, 'מספר טלפון חייב להכיל לפחות 9 ספרות')
    .max(20, 'מספר טלפון ארוך מדי')
    .trim()
    .regex(israeliPhoneRegex, 'מספר טלפון ישראלי לא תקין'),

  email: z
    .string()
    .email('כתובת אימייל לא תקינה')
    .max(254, 'כתובת אימייל ארוכה מדי')
    .toLowerCase()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),

  inquiry_type: z.enum(INQUIRY_TYPES, {
    errorMap: () => ({ message: 'סוג פנייה לא חוקי' }),
  }),

  message: z
    .string()
    .max(2000, 'ההודעה ארוכה מדי (מקסימום 2000 תווים)')
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),

  source: z
    .string()
    .max(100)
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),
});

export type LeadInput = z.infer<typeof leadSchema>;

// Sanitize output type after transformation
export type LeadInsert = {
  full_name: string;
  phone: string;
  email: string | null;
  inquiry_type: InquiryType;
  message: string | null;
  source: string | null;
};

// Contact form validation (lighter version for general enquiries)
export const contactSchema = z.object({
  full_name: z
    .string()
    .min(2, 'שם מלא חייב להכיל לפחות 2 תווים')
    .max(100, 'שם מלא ארוך מדי')
    .trim(),

  phone: z
    .string()
    .min(9, 'מספר טלפון חייב להכיל לפחות 9 ספרות')
    .max(20, 'מספר טלפון ארוך מדי')
    .trim()
    .regex(israeliPhoneRegex, 'מספר טלפון ישראלי לא תקין'),

  email: z
    .string()
    .email('כתובת אימייל לא תקינה')
    .max(254, 'כתובת אימייל ארוכה מדי')
    .toLowerCase()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? null : val)),

  message: z
    .string()
    .min(5, 'ההודעה חייבת להכיל לפחות 5 תווים')
    .max(2000, 'ההודעה ארוכה מדי (מקסימום 2000 תווים)')
    .trim(),
});

export type ContactInput = z.infer<typeof contactSchema>;
