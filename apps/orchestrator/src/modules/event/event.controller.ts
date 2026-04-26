import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CreateEventDto } from './dto/create-event.dto';
import { JoinEventDto } from './dto/join-event.dto';

@ApiTags('Events')
@Controller('api/events')
export class EventsController {

  @Post()
  @ApiOperation({ summary: 'Generates a unique event Code and initializes the session in the DB' })
  @ApiResponse({ status: 201, description: 'Event initialized successfully.' })
  async createEvent(@Body() createEventDto: CreateEventDto) {
    return ;
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Links a user to a specific session and triggers Data Processing' })
  @ApiParam({ name: 'id', description: 'The Event ID' })
  async joinEvent(@Param('id') id: string, @Body() joinDto: JoinEventDto) {
    return ;
  }

  @Get(':id')
  @ApiOperation({ summary: 'List of active participants and current Event Vector summary' })
  async getEventDetails(@Param('id') id: string) {
    return ;
  }

  @Post(':id/generate-playlist')
  @ApiOperation({ summary: 'Generates/Regenerates a Spotify playlist using Data Processing' })
  async generatePlaylist(@Param('id') id: string) {
    return ;
  }
}