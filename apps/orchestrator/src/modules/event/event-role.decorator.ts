import { SetMetadata } from '@nestjs/common';

export type EventRoleType = 'creator' | 'participant';

export const EVENT_ROLE_KEY = 'eventRole';

/**
 * Marks an event route with the minimum role the caller must hold.
 * 'creator' = only the event host. 'participant' = any member (creator included).
 * Enforced by {@link EventRoleGuard}.
 */
export const EventRole = (role: EventRoleType) =>
  SetMetadata(EVENT_ROLE_KEY, role);
