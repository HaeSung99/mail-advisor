import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  // 기본 조회
  findByUsername(username: string) {
    return this.repo.findOne({ where: { username } });
  }

  // 생성 및 저장
  async createUser(username: string, password: string) {
    const user = this.repo.create({ username, password });
    return this.repo.save(user);
  }

  // 토큰 수 증가
  async increaseTokenAmount(username: string, amount: number) {
    return this.repo.increment({ username }, 'tokenAmount', amount);
  }

  // 토큰 수 감소
  async decreaseTokenAmount(username: string, amount: number) {
    const user = await this.findByUsername(username);
    if (!user) return null;
    
    const newAmount = Math.max(0, (user.tokenAmount || 0) - amount);
    return this.repo.update({ username }, { tokenAmount: newAmount });
  }

  // 리프레시 토큰 저장
  async saveRefreshToken(username: string, refreshToken: string) {
    return this.repo.update({ username }, { refreshToken });
  }

  // 리프레시 토큰 삭제
  async clearRefreshToken(username: string) {
    return this.repo.update({ username }, { refreshToken: null });
  }
}
