import { z } from 'zod';
import { bookingAccessModeSchema } from '../../../shared/validation/common';

export const outboundDispatchProfileSeedSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  school: z.string().trim().min(1).optional(),
  campaign: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  retellAgentId: z.string().trim().min(1),
  retellFromPhoneNumber: z.string().trim().min(1),
  googleCalendarSubject: z.string().trim().email(),
  googleCalendarId: z.string().trim().min(1),
  bookingAccessMode: bookingAccessModeSchema.default('invite_only'),
  publicTitle: z.string().trim().min(1).optional(),
  publicSubtitle: z.string().trim().min(1).optional(),
  publicCity: z.string().trim().min(1).optional(),
  publicMeetingType: z.string().trim().min(1).optional(),
  publicAudience: z.string().trim().min(1).optional(),
  publicSortOrder: z.coerce.number().int().default(0),
  questionSetName: z.string().trim().min(1).default('general-screen'),
  generalQuestions: z.string().trim().default(''),
  isActive: z.boolean().default(true),
});

export const outboundDispatchProfileSchema = outboundDispatchProfileSeedSchema.extend({
  id: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1)
});

export type OutboundDispatchProfile = z.infer<typeof outboundDispatchProfileSchema>;
export type OutboundDispatchProfileSeed = z.infer<typeof outboundDispatchProfileSeedSchema>;
