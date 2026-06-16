import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  UnauthorizedException,
  HttpException,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { CreateEventDto } from "./dto/create-event.dto";
import { AuthGuard } from "@nestjs/passport";
import { EventsService } from "./event.service";
import { EventRole } from "./event-role.decorator";
import { EventRoleGuard } from "./event-role.guard";
import { PlaylistService } from "../playlist/playlist.service";
import { UserService } from "../user/user.service";
import { PlaylistError } from "../playlist/dto/playlist-response.dto";

@ApiTags("Events")
@Controller("api/events")
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly playlistService: PlaylistService,
    private readonly userService: UserService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard("jwt"))
  @ApiOperation({
    summary:
      "Generates a unique event Code and initializes the session in the DB",
  })
  @ApiBearerAuth("JWT-auth")
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({ status: 201, description: "Event initialized successfully." })
  @ApiResponse({
    status: 401,
    description: "Unauthorized. User must be authenticated to create an event.",
  })
  @ApiResponse({ status: 400, description: "Bad Request. Invalid input data." })
  @ApiResponse({
    status: 500,
    description:
      "Internal Server Error. An error occurred while creating the event.",
  })
  async createEvent(@Body() createEventDto: CreateEventDto, @Req() req: any) {
    const userId = req.user.userId;

    if (!userId) {
      throw new UnauthorizedException("User ID not found in token");
    }

    return this.eventsService.create(createEventDto, userId);
  }

  @Get("by-code/:code")
  @ApiOperation({
    summary: "Lookup event by 6-char code (used by QR / manual join)",
  })
  @ApiParam({ name: "code", description: "6-char alphanumeric event code" })
  @ApiResponse({ status: 200, description: "Event preview returned." })
  @ApiResponse({ status: 404, description: "Event not found." })
  async findByCode(@Param("code") code: string) {
    return this.eventsService.findByCode(code);
  }

  @Get("/my")
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Lists all events the authenticated user is participating in",
  })
  @ApiResponse({ status: 200, description: "List of user events." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({ status: 500, description: "Internal Server Error." })
  async getMyEvents(@Req() req: any) {
    const userId = req.user.userId;
    return await this.eventsService.findByUserId(userId);
  }

  @Post(":id/join")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "Links the authenticated user to a specific event" })
  @ApiParam({ name: "id", description: "The Event ID" })
  @ApiResponse({ status: 200, description: "Joined event." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({ status: 404, description: "Event not found." })
  async joinEvent(@Param("id") id: string, @Req() req: any) {
    const userId = req.user.userId;
    if (!userId) {
      throw new UnauthorizedException("User ID not found in token");
    }
    return this.eventsService.joinEvent(id, userId);
  }

  @Get(":id")
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "Event detail with participants" })
  @ApiParam({ name: "id", description: "Event ID" })
  @ApiResponse({ status: 200, description: "Event detail." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({
    status: 403,
    description: "Forbidden. User is not a member of this event.",
  })
  @ApiResponse({ status: 404, description: "Event not found." })
  async getEventDetails(@Param("id") id: string, @Req() req: any) {
    const userId = req.user.userId;
    if (!userId) {
      throw new UnauthorizedException("User ID not found in token");
    }
    return this.eventsService.findById(id, userId);
  }

  @Post(":id/generate-playlist")
  @UseGuards(AuthGuard("jwt"), EventRoleGuard)
  @EventRole("creator")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Generates/Regenerates a Spotify playlist using Data Processing",
  })
  @ApiParam({ name: "id", description: "Event ID" })
  @ApiResponse({ status: 200, description: "Playlist generated." })
  @ApiResponse({
    status: 401,
    description: "Unauthorized or Spotify token missing.",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden. Only the event host can generate the playlist.",
  })
  @ApiResponse({ status: 404, description: "Event not found." })
  async generatePlaylist(@Param("id") id: string, @Req() req: any) {
    this.logger.log(`[generate-playlist] START — eventId=${id}`);
    const userId = req.user.userId;
    if (!userId) {
      this.logger.error("[generate-playlist] No userId in JWT");
      throw new UnauthorizedException("User ID not found in token");
    }
    
    const result = await this.playlistService.generatePlaylist(id,userId);
    this.logger.log(
      `[generate-playlist] PlaylistService returned: playlistId=${result.playlistId}, tracksAdded=${result.tracksAdded}`,
    );

    await this.eventsService.savePlaylistResult(
      id,
      result.playlistId,
      result.playlistUrl,
      result.tracksAdded,
      result.tracks,
    );

    return result;
  }
}
