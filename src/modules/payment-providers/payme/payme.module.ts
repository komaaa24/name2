import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymeService } from './payme.service';
import { PaymeController } from './payme.controller';
import { BotModule } from '../../bot/bot.module';
import { PaymeBasicAuthGuard } from './auth/guards/payme.guard';
import {
  UserEntity,
  PlanEntity,
  TransactionEntity,
} from '../../../shared/database/entities';

@Module({
  imports: [
    BotModule,
    TypeOrmModule.forFeature([UserEntity, PlanEntity, TransactionEntity]),
  ],
  controllers: [PaymeController],
  providers: [PaymeService, PaymeBasicAuthGuard],
})
export class PaymeModule {}
