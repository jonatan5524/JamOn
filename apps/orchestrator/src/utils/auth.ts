import { HttpException, HttpStatus } from '@nestjs/common';

const BEARER_PREFIX = 'Bearer ';

export const extractBearerToken = (authHeader?: string): string => {
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    throw new HttpException(
      { message: 'Missing or invalid Authorization header' },
      HttpStatus.UNAUTHORIZED,
    );
  }

  return authHeader.slice(BEARER_PREFIX.length);
};
