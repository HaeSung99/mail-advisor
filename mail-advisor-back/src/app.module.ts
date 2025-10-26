import { Module } from '@nestjs/common';
import { AdvisorModule } from './advisor/advisor.module';
import { AdvisorController } from './advisor/advisor.controller';
import { AdvisorService } from './advisor/advisor.service';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './auth/user.entity';
import { UsersRepository } from './auth/user.repository';
import { JwtService } from './auth/jwt.service';
import { JwtModule } from '@nestjs/jwt';
import { PaymentModule } from './payment/payment.module';
import { Payment } from './payment/payment.entity';

@Module({
  imports: [ConfigModule.forRoot({isGlobal : true}), AdvisorModule, AuthModule, PaymentModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production'
    }),
    TypeOrmModule.forFeature([User, Payment]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || (() => {
        throw new Error('JWT_SECRET environment variable is required');
      })()
    })
  ],
  controllers: [AdvisorController, AuthController],
  providers: [AdvisorService, AuthService, UsersRepository, JwtService],
})
export class AppModule {}
