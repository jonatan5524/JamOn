import { ApiProperty } from "@nestjs/swagger";

export class JoinEventDto {
  @ApiProperty({ example: 'user_123456' })
  userId!: string;
}