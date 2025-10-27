import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './payment.entity';
import { UsersRepository } from '../auth/user.repository';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private usersRepository: UsersRepository,
  ) {}

  async confirmPayment(orderId: string, amount: number, username: string) {
    try {
      if (!process.env.TOSS_SECRET_KEY) {
        throw new Error('토스페이먼츠 시크릿 키가 없습니다');
      }

      // 토스 API 호출
      const auth = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64');
      const res = await fetch('https://api.tosspayments.com/v1/payments/key-in', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          orderId,
          orderName: `${amount.toLocaleString()}원 토큰 충전`,
          customerName: username,
          cardNumber: '5171977216207306',
          cardExpirationYear: '28',
          cardExpirationMonth: '03',
          cardPassword: '12',
          customerIdentityNumber: '990101',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '결제 실패');

      // 트랜잭션으로 토큰 증가 + 결제 내역 저장 원자적 처리
      const result = await this.paymentRepository.manager.transaction(async (manager) => {
        // 1. 사용자 조회
        const user = await manager.findOne('User', { 
          where: { username } 
        });
        if (!user) throw new Error('사용자를 찾을 수 없습니다');

        // 2. 토큰 증가 (원자적 연산)
        const tokens = amount; // 1원 = 1토큰
        await manager
          .createQueryBuilder()
          .update('User')
          .set({
            tokenAmount: () => `tokenAmount + ${tokens}`
          })
          .where('username = :username', { username })
          .execute();

        // 3. 결제 내역 저장
        const payment = manager.create(Payment, {
          orderId,
          paymentKey: data.paymentKey || `toss_${orderId}`,
          amount,
          tokens,
          status: 'SUCCESS',
          user,
        });
        const savedPayment = await manager.save(payment);

        return { success: true, tokens, paymentId: savedPayment.id };
      });

      return result;
    } catch (error) {
      throw new BadRequestException(`결제 실패: ${error.message}`);
    }
  }

  async getPaymentHistory(username: string) {
    const user = await this.usersRepository.findByUsername(username);
    if (!user) return [];
    
    return this.paymentRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }
}
