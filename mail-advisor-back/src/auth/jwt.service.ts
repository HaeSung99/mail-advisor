import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

@Injectable()
export class JwtService {
  constructor(private readonly jwtService: NestJwtService) {}

  // Access Token 발급
  generateAccessToken(payload: { username: string; id: number }) {
    return this.jwtService.sign(payload, {
        expiresIn: '2h'
    }); 
  }

  // Refresh Token 발급
  generateRefreshToken(payload: { username: string; id: number }) {
    return this.jwtService.sign(payload, { 
      expiresIn: '1d'
    });
  }

  // 토큰 검증
  verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      return null;
    }
  }
}
