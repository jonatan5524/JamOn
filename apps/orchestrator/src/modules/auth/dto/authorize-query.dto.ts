import { IsEmail } from "class-validator";

export class AuthorizeQueryDto {
  @IsEmail()
  email!: string;
}
