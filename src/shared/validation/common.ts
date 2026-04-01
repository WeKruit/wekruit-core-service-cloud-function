import { z } from 'zod';

export const bookingAccessModeSchema = z.enum(['public', 'invite_only']);
