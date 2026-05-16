import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateEventDto {

  @ApiProperty({ example: 'My Birthday Party' })
  @IsString()       
  @IsNotEmpty()
  title!: string;
  
  @ApiProperty({ example: 'High energy pop and dance music' })
  @IsString()
  @IsNotEmpty()
  context!: string;
}