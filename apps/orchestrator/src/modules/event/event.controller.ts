import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CreateEventDto } from './dto/create-event.dto';
import { AuthGuard } from '@nestjs/passport';
import { EventsService } from './event.service';

@ApiTags('Events')
@Controller('api/events')
export class EventsController {

  constructor(private readonly eventsService: EventsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Generates a unique event Code and initializes the session in the DB' })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({ status: 201, description: 'Event initialized successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized. User must be authenticated to create an event.' })
  @ApiResponse({ status: 400, description: 'Bad Request. Invalid input data.' })
  @ApiResponse({ status: 500, description: 'Internal Server Error. An error occurred while creating the event.' })
  async createEvent(@Body() createEventDto: CreateEventDto, @Req() req: any,) {
    const userId = req.user.userId;

    if (!userId) {
      throw new UnauthorizedException('User ID not found in token');
    }

    return this.eventsService.create(createEventDto, userId);
  }

  @Get('by-code/:code')
  @ApiOperation({ summary: 'Lookup event by 6-char code (used by QR / manual join)' })
  @ApiParam({ name: 'code', description: '6-char alphanumeric event code' })
  @ApiResponse({ status: 200, description: 'Event preview returned.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  async findByCode(@Param('code') code: string) {
    return this.eventsService.findByCode(code);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Links the authenticated user to a specific event' })
  @ApiParam({ name: 'id', description: 'The Event ID' })
  @ApiResponse({ status: 200, description: 'Joined event.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  async joinEvent(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in token');
    }
    return this.eventsService.joinEvent(id, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'List of active participants and current Event Vector summary' })
  async getEventDetails(@Param('id') id: string) {
    return;
  }

  @Post(':id/generate-playlist')
  @ApiOperation({ summary: 'Generates/Regenerates a Spotify playlist using Data Processing' })
  async generatePlaylist(@Param('id') id: string) {
    return;
  }
}