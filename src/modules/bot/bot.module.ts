import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BotService } from './bot.service';
import {
  UserEntity,
  PlanEntity,
  UserFavoriteNameEntity,
  UserPersonaProfileEntity,
  TransactionEntity,
  ActivityLogEntity,
  UserPaymentEntity,
  RequestedNameEntity,
} from '../../shared/database/entities';
import { NameMeaningService } from './services/name-meaning.service';
import { BotCoreService } from './services/bot-core.service';
import { NameInsightsService } from './services/name-insights.service';
import { UserFavoritesService } from './services/user-favorites.service';
import { UserPersonaService } from './services/user-persona.service';
import { AdminService } from './services/admin.service';
import { NameGeneratorApiService } from './services/name-generator-api.service';
import { ActivityTrackerService } from './services/activity-tracker.service';
import { NameCardGeneratorService } from './services/name-card-generator.service';
import { NameMatchService } from './services/name-match.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      PlanEntity,
      UserFavoriteNameEntity,
      UserPersonaProfileEntity,
      TransactionEntity,
      ActivityLogEntity,
      UserPaymentEntity,
      RequestedNameEntity,
    ]),
    HttpModule,
  ],
  providers: [
    BotCoreService,
    BotService,
    NameMeaningService,
    NameInsightsService,
    UserFavoritesService,
    UserPersonaService,
    AdminService,
    NameGeneratorApiService,
    ActivityTrackerService,
    NameCardGeneratorService,
    NameMatchService,
  ],
  exports: [BotService],
})
export class BotModule { }
