import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionMethods } from './constants/transaction-methods';
import { CheckPerformTransactionDto } from './dto/check-perform-transaction.dto';
import { RequestBody } from './types/incoming-request-body';
import { GetStatementDto } from './dto/get-statement.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { PerformTransactionDto } from './dto/perform-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ErrorStatusCodes } from './constants/error-status-codes';
import { TransactionState } from './constants/transaction-state';
import { CheckTransactionDto } from './dto/check-transaction.dto';
import { PaymeError } from './constants/payme-error';
import { CancelingReasons } from './constants/canceling-reasons';
import logger from '../../../shared/utils/logger';
import { ValidationHelper } from '../../../shared/utils/validation.helper';
import {
  UserEntity,
  PlanEntity,
  TransactionEntity,
} from '../../../shared/database/entities';
import {
  PaymentProvider,
  TransactionStatus,
  PaymentType,
  PaymentStatus,
} from '../../../shared/database/entities/enums';
import { ConfigService } from '@nestjs/config';
import { BotService } from '../../bot/bot.service';

function hasActiveSubscription(user?: {
  isActive?: boolean;
  subscriptionEnd?: Date | null;
}): boolean {
  if (!user || !user.isActive || !user.subscriptionEnd) {
    return false;
  }

  const subscriptionEnd =
    user.subscriptionEnd instanceof Date
      ? user.subscriptionEnd
      : new Date(user.subscriptionEnd);

  return subscriptionEnd.getTime() > Date.now();
}

@Injectable()
export class PaymeService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly configService: ConfigService,
    private readonly botService: BotService,
  ) { }

  private buildAccountFieldError(
    error: typeof PaymeError.UserNotFound,
    field: 'user_id' | 'plan_id',
  ) {
    return {
      ...error,
      data: field,
    };
  }

  async handleTransactionMethods(reqBody: RequestBody) {
    const method = reqBody.method;
    switch (method) {
      case TransactionMethods.CheckPerformTransaction:
        return await this.checkPerformTransaction(
          reqBody as CheckPerformTransactionDto,
        );

      case TransactionMethods.CreateTransaction:
        return await this.createTransaction(reqBody as CreateTransactionDto);

      case TransactionMethods.CheckTransaction:
        return await this.checkTransaction(
          reqBody as unknown as CheckTransactionDto,
        );

      case TransactionMethods.PerformTransaction:
        return await this.performTransaction(reqBody as PerformTransactionDto);

      case TransactionMethods.CancelTransaction:
        return await this.cancelTransaction(reqBody as CancelTransactionDto);

      case TransactionMethods.GetStatement:
        return await this.getStatement(reqBody as GetStatementDto);
      default:
        return {
          error: {
            code: -32601,
            message: {
              uz: 'Metod topilmadi',
              en: 'Method not found',
              ru: 'Метод не найден',
            },
          },
        };
    }
  }

  private extractAccountParams(account: any): {
    planId?: string;
    userId?: string;
    selectedService?: string;
  } {
    const planId = account?.plan_id;
    const userId = account?.user_id;
    const selectedService = account?.selected_service ?? account?.selected_sport;

    if (planId && userId) {
      return { planId, userId, selectedService };
    }

    const orderId =
      typeof account?.order_id === 'string' ? account.order_id.trim() : '';

    if (!orderId) {
      return { planId, userId, selectedService };
    }

    const [parsedPlanId, parsedUserId] = orderId
      .split(':')
      .map((part: string) => part.trim());

    return {
      planId: parsedPlanId || planId,
      userId: parsedUserId || userId,
      selectedService,
    };
  }

  async checkPerformTransaction(
    checkPerformTransactionDto: CheckPerformTransactionDto,
  ) {
    try {
      logger.info('🔵 CheckPerformTransaction called', {
        params: checkPerformTransactionDto.params,
      });

      const { planId, userId, selectedService } = this.extractAccountParams(
        checkPerformTransactionDto.params?.account,
      );

      logger.info('🔍 Validating IDs', { planId, userId, selectedService });

      if (selectedService) {
        logger.info(
          `Selected service in checkPerformTransaction: ${selectedService}`,
        );
      }

      if (!ValidationHelper.isValidObjectId(planId)) {
        logger.warn('❌ Invalid planId format', { planId });
        return {
          error: this.buildAccountFieldError(PaymeError.ProductNotFound, 'plan_id'),
        };
      }

      if (!ValidationHelper.isValidObjectId(userId)) {
        logger.warn('❌ Invalid userId format', { userId });
        return {
          error: this.buildAccountFieldError(PaymeError.UserNotFound, 'user_id'),
        };
      }

      logger.info('🔎 Searching for plan and user in database');
      const plan = await this.planRepository.findOne({ where: { id: planId } });
      const user = await this.userRepository.findOne({ where: { id: userId } });

      logger.info('📊 Database query results', {
        planFound: !!plan,
        userFound: !!user,
        planData: plan
          ? { id: plan.id, name: plan.name, price: plan.price }
          : null,
        userData: user ? { id: user.id, telegramId: user.telegramId } : null,
      });

      if (!plan || !user) {
        logger.warn('❌ Plan or user not found in database');
        return {
          error: !plan
            ? this.buildAccountFieldError(PaymeError.ProductNotFound, 'plan_id')
            : this.buildAccountFieldError(PaymeError.UserNotFound, 'user_id'),
        };
      }

      if (hasActiveSubscription(user)) {
        logger.info('✅ User already has active subscription');
        return {
          error: PaymeError.AlreadyDone,
        };
      } // Payme amount handling - string yoki number bo'lishi mumkin
      let requestAmount: number;
      const originalAmount = checkPerformTransactionDto.params.amount;

      if (typeof originalAmount === 'string') {
        // Agar string kelsa va som formatida bo'lsa (5555.00), uni tiynlarga aylantiramiz
        const amountFloat = parseFloat(originalAmount);
        requestAmount = Math.round(amountFloat * 100); // 5555.00 → 555500
      } else {
        requestAmount = Number(originalAmount); // 555500
      }

      logger.info('💰 Payme amount validation (checkPerformTransaction)', {
        planPrice: plan.price,
        planPriceType: typeof plan.price,
        requestAmountOriginal: originalAmount,
        requestAmountConverted: requestAmount,
        requestAmountInSom: requestAmount / 100,
      });

      // Payme da summa tiynlarda keladi (555500 = 5555.00 som)
      const amountInSom = requestAmount / 100;
      const planPriceAsNumber = parseFloat(plan.price.toString());

      logger.info('🔍 Payme amount comparison', {
        amountInSom,
        planPriceAsNumber,
        isEqual: amountInSom === planPriceAsNumber,
      });

      if (amountInSom !== planPriceAsNumber) {
        logger.warn('❌ Invalid amount in Payme checkPerformTransaction', {
          expectedPlanPrice: plan.price,
          expectedPlanPriceAsNumber: planPriceAsNumber,
          receivedAmountInSom: amountInSom,
          receivedAmountInTiyns: checkPerformTransactionDto.params.amount,
        });
        return {
          error: PaymeError.InvalidAmount,
        };
      }

      logger.info('✅ Payme amount validation passed');

      logger.info('✅ Transaction allowed');
      return {
        result: {
          allow: true,
        },
      };
    } catch (error) {
      logger.error('❌ Error in checkPerformTransaction', {
        error: error.message,
        stack: error.stack,
      });
      return {
        error: {
          code: ErrorStatusCodes.SystemError,
          message: {
            uz: 'Tizimda xatolik yuz berdi',
            en: 'System error occurred',
            ru: 'Произошла системная ошибка',
          },
          data: error.message,
        },
      };
    }
  }

  async createTransaction(createTransactionDto: CreateTransactionDto) {
    try {
      logger.info('🔵 CreateTransaction called', {
        params: createTransactionDto.params,
      });

      const { planId, userId, selectedService } = this.extractAccountParams(
        createTransactionDto.params?.account,
      );
      const transId = createTransactionDto.params?.id;

      logger.info('🔍 Transaction details', {
        planId,
        userId,
        transId,
        selectedService,
      });

      if (selectedService) {
        logger.info(
          `Selected service in createTransaction: ${selectedService}`,
        );
      }

      if (!ValidationHelper.isValidObjectId(planId)) {
        logger.warn('❌ Invalid planId format in createTransaction', {
          planId,
        });
        return {
          error: this.buildAccountFieldError(PaymeError.ProductNotFound, 'plan_id'),
          id: transId,
        };
      }

      if (!ValidationHelper.isValidObjectId(userId)) {
        logger.warn('❌ Invalid userId format in createTransaction', {
          userId,
        });
        return {
          error: this.buildAccountFieldError(PaymeError.UserNotFound, 'user_id'),
          id: transId,
        };
      }

      logger.info('🔎 Searching for plan and user');
      const plan = await this.planRepository.findOne({ where: { id: planId } });
      const user = await this.userRepository.findOne({ where: { id: userId } });

      logger.info('📊 Query results', {
        planFound: !!plan,
        userFound: !!user,
      });

      if (!user) {
        return {
          error: this.buildAccountFieldError(PaymeError.UserNotFound, 'user_id'),
          id: transId,
        };
      }

      if (!plan) {
        return {
          error: this.buildAccountFieldError(PaymeError.ProductNotFound, 'plan_id'),
          id: transId,
        };
      }

      if (hasActiveSubscription(user)) {
        return {
          error: PaymeError.AlreadyDone,
          id: transId,
        };
      } // Payme amount handling - string yoki number bo'lishi mumkin
      let requestAmount: number;
      const originalAmount = createTransactionDto.params.amount;

      if (typeof originalAmount === 'string') {
        // Agar string kelsa va som formatida bo'lsa (5555.00), uni tiynlarga aylantiramiz
        const amountFloat = parseFloat(originalAmount);
        requestAmount = Math.round(amountFloat * 100); // 5555.00 → 555500
      } else {
        requestAmount = Number(originalAmount); // 555500
      }

      // Payme da summa tiynlarda keladi (555500 = 5555.00 som)
      const amountInSom = requestAmount / 100;
      const planPriceAsNumber = parseFloat(plan.price.toString());

      logger.info('💰 Payme amount validation (createTransaction)', {
        planPrice: plan.price,
        planPriceAsNumber,
        requestAmountOriginal: originalAmount,
        requestAmountConverted: requestAmount,
        amountInSom,
        isValid: amountInSom === planPriceAsNumber,
      });

      if (amountInSom !== planPriceAsNumber) {
        logger.warn('❌ Invalid amount in Payme createTransaction', {
          expectedPlanPrice: plan.price,
          expectedPlanPriceAsNumber: planPriceAsNumber,
          receivedAmountInSom: amountInSom,
          receivedAmountInTiyns: createTransactionDto.params.amount,
        });
        return {
          error: PaymeError.InvalidAmount,
          id: transId,
        };
      }

      logger.info('✅ Payme createTransaction amount validation passed');

      const existingTransaction = await this.transactionRepository.findOne({
        where: {
          userId,
          planId,
          status: TransactionStatus.PENDING,
        },
      });

      if (existingTransaction) {
        // Eski transactionning muddatini tekshirish
        const isExpired = this.checkTransactionExpiration(
          existingTransaction.createdAt,
        );

        if (isExpired) {
          // Muddati tugagan transaction - bekor qilish
          await this.transactionRepository.update(
            { id: existingTransaction.id },
            {
              status: TransactionStatus.CANCELED,
              state: TransactionState.PendingCanceled,
              cancelTime: new Date(),
              reason: CancelingReasons.CanceledDueToTimeout,
            },
          );

          logger.info(
            `Expired pending transaction ${existingTransaction.transId} cancelled`,
          );
        } else if (existingTransaction.transId === transId) {
          return {
            result: {
              transaction: existingTransaction.id,
              state: TransactionState.Pending,
              create_time: new Date(existingTransaction.createdAt).getTime(),
            },
          };
        } else {
          return {
            error: PaymeError.TransactionInProcess,
            id: transId,
          };
        }
      }

      const transaction = await this.transactionRepository.findOne({
        where: { transId },
      });

      if (transaction) {
        if (this.checkTransactionExpiration(transaction.createdAt)) {
          await this.transactionRepository.update(
            { transId },
            {
              status: TransactionStatus.CANCELED,
              cancelTime: new Date(),
              state: TransactionState.PendingCanceled,
              reason: CancelingReasons.CanceledDueToTimeout,
            },
          );

          return {
            error: {
              ...PaymeError.CantDoOperation,
              state: TransactionState.PendingCanceled,
              reason: CancelingReasons.CanceledDueToTimeout,
            },
            id: transId,
          };
        }

        return {
          result: {
            transaction: transaction.id,
            state: TransactionState.Pending,
            create_time: new Date(transaction.createdAt).getTime(),
          },
        };
      }

      const checkTransaction: CheckPerformTransactionDto = {
        method: TransactionMethods.CheckPerformTransaction,
        params: {
          amount: createTransactionDto.params.amount,
          account: {
            plan_id: planId,
            user_id: userId,
            ...(selectedService ? { selected_service: selectedService } : {}),
          },
        },
      };

      const checkResult = await this.checkPerformTransaction(checkTransaction);

      if (checkResult.error) {
        return {
          error: checkResult.error,
          id: transId,
        };
      }
      logger.info(
        `Selected sport before createTransaction: ${selectedService}`,
      );

      const newTransaction = this.transactionRepository.create({
        transId: createTransactionDto.params.id,
        userId,
        paymentType: PaymentType.ONETIME,
        planId,
        provider: PaymentProvider.PAYME,
        state: TransactionState.Pending,
        amount: createTransactionDto.params.amount,
        selectedService: selectedService,
      });

      await this.transactionRepository.save(newTransaction);

      logger.info('✅ Transaction created successfully', {
        transactionId: newTransaction.id,
        transId: newTransaction.transId,
      });

      return {
        result: {
          transaction: newTransaction.id,
          state: TransactionState.Pending,
          create_time: new Date(newTransaction.createdAt).getTime(),
        },
      };
    } catch (error) {
      logger.error('❌ Error in createTransaction', {
        error: error.message,
        stack: error.stack,
        params: createTransactionDto.params,
      });
      return {
        error: {
          code: ErrorStatusCodes.SystemError,
          message: {
            uz: 'Tizimda xatolik yuz berdi',
            en: 'System error occurred',
            ru: 'Произошла системная ошибка',
          },
          data: error.message,
        },
        id: createTransactionDto.params?.id,
      };
    }
  }

  async performTransaction(performTransactionDto: PerformTransactionDto) {
    const transaction = await this.transactionRepository.findOne({
      where: { transId: performTransactionDto.params.id },
    });

    if (!transaction) {
      return {
        error: PaymeError.TransactionNotFound,
        id: performTransactionDto.params.id,
      };
    }

    const user = await this.userRepository.findOne({
      where: { id: transaction.userId },
    });

    // Faqat subscription to'lovlari uchun aktiv obuna tekshiruvi
    // Onetime to'lovlar uchun bu tekshiruv o'tkazib yuboriladi
    // if (
    //   user &&
    //   hasActiveSubscription(user) &&
    //   transaction.status === TransactionStatus.PENDING
    // ) {
    //   await Transaction.findOneAndUpdate(
    //     { transId: performTransactionDto.params.id },
    //     {
    //       status: TransactionStatus.CANCELED,
    //       state: TransactionState.PendingCanceled,
    //       cancelTime: new Date(),
    //       reason: CancelingReasons.TransactionFailed,
    //     },
    //   ).exec();
    //
    //   return {
    //     error: {
    //       ...PaymeError.AlreadyDone,
    //       state: TransactionState.PendingCanceled,
    //       reason: CancelingReasons.TransactionFailed,
    //     },
    //     id: performTransactionDto.params.id,
    //   };
    // }

    if (transaction.status !== 'PENDING') {
      if (transaction.status !== 'PAID') {
        return {
          error: PaymeError.CantDoOperation,
          id: performTransactionDto.params.id,
        };
      }

      return {
        result: {
          state: transaction.state,
          transaction: transaction.id,
          perform_time: transaction.performTime
            ? new Date(transaction.performTime).getTime()
            : null,
        },
      };
    }

    const expirationTime = this.checkTransactionExpiration(
      transaction.createdAt,
    );

    if (expirationTime) {
      await this.transactionRepository.update(
        { transId: performTransactionDto.params.id },
        {
          status: TransactionStatus.CANCELED,
          cancelTime: new Date(),
          state: TransactionState.PendingCanceled,
          reason: CancelingReasons.CanceledDueToTimeout,
        },
      );

      return {
        error: {
          state: TransactionState.PendingCanceled,
          reason: CancelingReasons.CanceledDueToTimeout,
          ...PaymeError.CantDoOperation,
        },
        id: performTransactionDto.params.id,
      };
    }

    const performTime = new Date();

    await this.transactionRepository.update(
      { transId: performTransactionDto.params.id },
      {
        status: TransactionStatus.PAID,
        state: TransactionState.Paid,
        performTime,
      },
    );

    const updatedPayment = await this.transactionRepository.findOne({
      where: { transId: performTransactionDto.params.id },
    });

    const plan = await this.planRepository.findOne({
      where: { id: transaction.planId },
    });

    if (!plan) {
      return {
        error: PaymeError.ProductNotFound,
        id: performTransactionDto.params.id,
      };
    }

    try {
      if (user && plan) {
        // Foydalanuvchini VIP qilish (1 yillik obuna)
        const subscriptionEndDate = new Date();
        subscriptionEndDate.setFullYear(
          subscriptionEndDate.getFullYear() + 1,
        ); // 1 yil

        await this.userRepository.update(
          { id: user.id },
          {
            subscriptionType: 'onetime' as any,
            isActive: true,
            subscriptionEnd: subscriptionEndDate,
          },
        );

        logger.info('✅ User activated with lifetime subscription via Payme', {
          userId: user.id,
          telegramId: user.telegramId,
          transId: performTransactionDto.params.id,
          amount: transaction.amount,
          subscriptionEnd: subscriptionEndDate,
        });

        // Bot orqali foydalanuvchiga xabar berish
        try {
          await this.botService.handleSubscriptionSuccess(
            user.id,
            plan.id,
            365, // 1 yil (kunlarda)
            PaymentProvider.PAYME,
            {
              subscriptionId: plan.id,
              transactionId: performTransactionDto.params.id,
              amount: Number(transaction.amount),
              currency: 'UZS',
              paymentMethod: PaymentProvider.PAYME,
              status: PaymentStatus.COMPLETED,
            },
          );
        } catch (notificationError) {
          logger.error(
            'Failed to send Payme payment success notification:',
            notificationError,
          );
        }
      }
    } catch (error) {
      logger.error('Error handling payment success:', error);
    }

    return {
      result: {
        transaction: updatedPayment?.id,
        perform_time: performTime.getTime(),
        state: TransactionState.Paid,
      },
    };
  }

  async cancelTransaction(cancelTransactionDto: CancelTransactionDto) {
    const transId = cancelTransactionDto.params.id;

    const transaction = await this.transactionRepository.findOne({
      where: { transId },
    });

    if (!transaction) {
      return {
        id: transId,
        error: PaymeError.TransactionNotFound,
      };
    }

    if (transaction.status === TransactionStatus.PENDING) {
      await this.transactionRepository.update(
        { id: transaction.id },
        {
          status: TransactionStatus.CANCELED,
          state: TransactionState.PendingCanceled,
          cancelTime: new Date(),
          reason: cancelTransactionDto.params.reason,
        },
      );

      const cancelTransaction = await this.transactionRepository.findOne({
        where: { id: transaction.id },
      });

      return {
        result: {
          cancel_time: cancelTransaction?.cancelTime?.getTime(),
          transaction: cancelTransaction?.id,
          state: TransactionState.PendingCanceled,
        },
      };
    }

    if (transaction.state !== TransactionState.Paid) {
      return {
        result: {
          state: transaction.state,
          transaction: transaction.id,
          cancel_time: transaction.cancelTime?.getTime(),
        },
      };
    }

    await this.transactionRepository.update(
      { id: transaction.id },
      {
        status: TransactionStatus.CANCELED,
        state: TransactionState.PaidCanceled,
        cancelTime: new Date(),
        reason: cancelTransactionDto.params.reason,
      },
    );

    const updatedTransaction = await this.transactionRepository.findOne({
      where: { id: transaction.id },
    });

    return {
      result: {
        cancel_time: updatedTransaction?.cancelTime?.getTime(),
        transaction: updatedTransaction?.id,
        state: TransactionState.PaidCanceled,
      },
    };
  }

  async checkTransaction(checkTransactionDto: CheckTransactionDto) {
    const transaction = await this.transactionRepository.findOne({
      where: { transId: checkTransactionDto.params.id },
    });

    if (!transaction) {
      return {
        error: PaymeError.TransactionNotFound,
        id: checkTransactionDto.params.id,
      };
    }

    return {
      result: {
        create_time: transaction.createdAt.getTime(),
        perform_time: transaction.performTime
          ? new Date(transaction.performTime).getTime()
          : 0,
        cancel_time: transaction.cancelTime
          ? new Date(transaction.cancelTime).getTime()
          : 0,
        transaction: transaction.id,
        state: transaction.state,
        reason: transaction.reason ?? null,
      },
    };
  }

  async getStatement(getStatementDto: GetStatementDto) {
    const transactions = await this.transactionRepository.find({
      where: {
        provider: PaymentProvider.PAYME,
      },
    });

    // Filter by date range in application layer (TypeORM date filtering with Between)
    const filteredTransactions = transactions.filter((transaction) => {
      const createdAt = new Date(transaction.createdAt);
      const from = new Date(getStatementDto.params.from);
      const to = new Date(getStatementDto.params.to);
      return createdAt >= from && createdAt <= to;
    });

    return {
      result: {
        transactions: filteredTransactions.map((transaction) => {
          return {
            id: transaction.transId,
            time: new Date(transaction.createdAt).getTime(),
            amount: transaction.amount,
            account: {
              user_id: transaction.userId,
              planId: transaction.planId,
            },
            create_time: new Date(transaction.createdAt).getTime(),
            perform_time: transaction.performTime
              ? new Date(transaction.performTime).getTime()
              : 0,
            cancel_time: transaction.cancelTime
              ? new Date(transaction.cancelTime).getTime()
              : null,
            transaction: transaction.id,
            state: transaction.state,
            reason: transaction.reason || null,
          };
        }),
      },
    };
  }

  private checkTransactionExpiration(createdAt: Date) {
    const transactionCreatedAt = new Date(createdAt);
    const timeoutDuration = 15 * 60 * 1000; // 15 daqiqa (Payme standarti)
    const timeoutThreshold = new Date(Date.now() - timeoutDuration);

    return transactionCreatedAt < timeoutThreshold;
  }
}
