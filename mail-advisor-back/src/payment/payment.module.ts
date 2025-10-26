import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { Payment } from './payment.entity';
import { User } from '../auth/user.entity';
import { UsersRepository } from '../auth/user.repository';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtService } from '../auth/jwt.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, User]),
    AuthModule,
    JwtModule.register({
        secret: process.env.JWT_SECRET
    })
  ],
  controllers: [PaymentController],
  providers: [PaymentService, UsersRepository, JwtService, JwtAuthGuard],
  exports: [PaymentService],
})
export class PaymentModule {}
