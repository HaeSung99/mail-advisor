import { Module } from '@nestjs/common';
import { AdvisorModule } from './advisor/advisor.module';
import { AdvisorController } from './advisor/advisor.controller';
import { AdvisorService } from './advisor/advisor.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({isGlobal : true}), AdvisorModule],
  controllers: [AdvisorController],
  providers: [AdvisorService],
})
export class AppModule {}
