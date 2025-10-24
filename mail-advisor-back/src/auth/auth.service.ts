import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersRepository } from './user.repository';
import { JwtService } from './jwt.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly jwtService: JwtService
  ) {}

  // 회원가입
  async signup(username: string, password: string) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const created = await this.usersRepo.createUser(username, hashedPassword);
      
      const { password: _, ...safe } = created as any; // ...safe 는 password를 제외한 유저 정보
      return safe;
    } catch (e: any) {
      // MySQL: ER_DUP_ENTRY, Postgres: 23505
      if (e?.code === 'ER_DUP_ENTRY' || e?.code === '23505') {
        throw new ConflictException('이미 존재하는 username');
      }
      throw e;
    }
  }

  // 로그인: username+password 검증 후 RT 저장
  async login(username: string, password: string) {
    const user = await this.usersRepo.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('아이디/비밀번호가 올바르지 않습니다.');
    }
    
    const payload = { username: user.username, id: user.id };
    const accessToken = this.jwtService.generateAccessToken(payload);
    const refreshToken = this.jwtService.generateRefreshToken(payload);

    await this.usersRepo.saveRefreshToken(username, refreshToken);
    return { 
      accessToken, 
      refreshToken, 
      tokenAmount: user.tokenAmount || 0 
    };
  }

  // 로그아웃: RT 삭제
  async logout(username: string) {
    await this.usersRepo.clearRefreshToken(username);
    return { ok: true };
  }

  // 토큰 수 증가(원자적)
  async increaseToken(username: string, amount: number) {
    return this.usersRepo.increaseTokenAmount(username, Math.abs(amount));
  }

  // 토큰 수 감소(0 미만은 0으로 클램프)
  async decreaseToken(username: string, amount: number) {
    return this.usersRepo.decreaseTokenAmount(username, Math.abs(amount));
  }

  // 토큰 갱신
  async refreshToken(refreshToken: string) {
    const payload = this.jwtService.verifyToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('유효하지 않은 refresh token');
    }

    const user = await this.usersRepo.findByUsername(payload.username);
    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedException('유효하지 않은 refresh token');
    }

    const newPayload = { username: user.username, id: user.id };
    const newAccessToken = this.jwtService.generateAccessToken(newPayload);
    
    return { accessToken: newAccessToken };
  }
}
