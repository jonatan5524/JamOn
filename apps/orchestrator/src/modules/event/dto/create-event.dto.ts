import { ApiProperty } from "@nestjs/swagger";

export class CreateEventDto {
  @ApiProperty({ example: 'My Birthday Party' })
  name!: string;
  @ApiProperty({ example: 'High energy pop and dance music' })
  description!: string;
}