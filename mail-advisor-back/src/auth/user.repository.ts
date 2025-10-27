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

  // 토큰 수 감소 (원자적 연산으로 동시성 처리)
  async decreaseTokenAmount(username: string, amount: number) {
    // GREATEST 함수로 0 미만으로 내려가지 않도록 보장
    // 단일 쿼리로 처리하여 Race Condition 방지
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({
        tokenAmount: () => `GREATEST(0, tokenAmount - ${amount})`
      })
      .where('username = :username', { username })
      .execute();
    
    return result;
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
