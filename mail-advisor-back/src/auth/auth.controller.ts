// src/auth/auth.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authservice: AuthService) {}

  @Post('signup')
  signup(@Body() body: { username: string; password: string }) {
    return this.authservice.signup(body.username, body.password);
  }

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.authservice.login(body.username, body.password);
  }

  @Post('logout')
  logout(@Body() body: { username: string }) {
    return this.authservice.logout(body.username);
  }


  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authservice.refreshToken(body.refreshToken);
  }
}
