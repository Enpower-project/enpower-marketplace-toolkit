import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class SwaggerRootRedirectController {
  @Get('oauth2-redirect.html')
  redirect(@Res() res: Response) {
    return res.redirect('/docs/oauth2-redirect.html');
  }
}
