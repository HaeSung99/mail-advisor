import { Module } from '@nestjs/common';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { UsersRepository } from '../auth/user.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { JwtService } from '../auth/jwt.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET
    })
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService, UsersRepository, JwtService, JwtAuthGuard]
})
export class AdvisorModule {}
