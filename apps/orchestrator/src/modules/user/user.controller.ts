import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('api/users')
export class UsersController {

  @Get('me')
  @ApiOperation({ summary: 'Retrieve current user profile and event history' })
  async getProfile() {
    return ;
  }
}