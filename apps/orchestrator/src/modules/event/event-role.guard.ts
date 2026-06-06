import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  EVENT_ROLE_KEY,
  EventRoleType,
} from './event-role.decorator';
import { EventsService } from './event.service';

/**
 * Authorizes event routes by the caller's role on the `:id` event.
 * Pair with `@EventRole(...)`; runs after `AuthGuard('jwt')` so `req.user` is set.
 * Delegates lookup to {@link EventsService.getViewerRole}, which throws 404 for a
 * missing event and 403 for a non-member.
 */
@Injectable()
export class EventRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly eventsService: EventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<EventRoleType>(
      EVENT_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in token');
    }

    const eventId = request.params.id;
    const role = await this.eventsService.getViewerRole(eventId, userId);

    if (required === 'creator' && role !== 'creator') {
      throw new ForbiddenException('Only the event host can perform this action');
    }
    return true;
  }
}
