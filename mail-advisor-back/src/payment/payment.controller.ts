import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payment')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  // 결제 승인 (토스페이먼츠 API 실제 호출)
  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  async confirmPayment(@Body() body: { orderId: string; amount: number }, @Request() req) {
    const username = req.user.username;
    return await this.paymentService.confirmPayment(body.orderId, body.amount, username);
  }

  // 결제 이력 조회
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getPaymentHistory(@Request() req) {
    const username = req.user.username;
    return await this.paymentService.getPaymentHistory(username);
  }
}
