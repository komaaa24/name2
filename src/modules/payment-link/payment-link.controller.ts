import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  buildClickProviderUrl,
  ClickRedirectParams,
} from '../../shared/generators/click-redirect-link.generator';
import {
  buildPaymeProviderUrl,
  PaymeLinkGeneratorParams,
} from '../../shared/generators/payme-link.generator';
import { config } from '../../shared/config';
import { verifySignedToken } from '../../shared/utils/signed-token.util';
import logger from '../../shared/utils/logger';

type RedirectPayload = ClickRedirectParams | PaymeLinkGeneratorParams;

@Controller('payment-link')
export class PaymentLinkController {
  @Get('click')
  redirectToClick(@Query('token') token: string, @Res() res: Response) {
    return res.redirect(this.resolveRedirectUrl(token, 'click'));
  }

  @Get('payme')
  redirectToPayme(@Query('token') token: string, @Res() res: Response) {
    return res.redirect(this.resolveRedirectUrl(token, 'payme'));
  }

  /**
   * Donation-style Payme link: client kiritgan summa (UZS) bo'yicha checkoutga yo'naltiradi.
   * Example: /api/payment-link/payme-donate?amount=10000&returnUrl=https://t.me/your_bot
   */
  @Get('payme-donate')
  paymeDonate(
    @Query('amount') amount: string,
    @Query('returnUrl') returnUrl: string,
    @Query('planId') planId = 'donate',
    @Query('userId') userId = 'donor',
    @Query('redirect') redirect = '0',
    @Res() res: Response,
  ) {
    const numeric = Number(amount);
    if (!amount || Number.isNaN(numeric) || numeric <= 0) {
      throw new BadRequestException('amount is required and must be > 0');
    }

    const params: PaymeLinkGeneratorParams = {
      planId,
      userId,
      amount: numeric,
      returnUrl: returnUrl || undefined,
    };

    const url = buildPaymeProviderUrl(params);
    logger.info('🔗 Payme donation link generated', { ...params, url });
    if (redirect === '1' || redirect === 'true') {
      return res.redirect(url);
    }
    return res.json({ url });
  }

  private resolveRedirectUrl(
    token: string,
    provider: 'click' | 'payme',
  ): string {
    if (!token) {
      throw new BadRequestException('Missing redirect token');
    }

    let payload: RedirectPayload;
    try {
      payload = verifySignedToken<RedirectPayload>(
        token,
        config.PAYMENT_LINK_SECRET,
      );
    } catch (error) {
      throw new BadRequestException('Invalid or expired redirect token');
    }

    if (provider === 'click') {
      return buildClickProviderUrl(payload as ClickRedirectParams);
    }

    return buildPaymeProviderUrl(payload as PaymeLinkGeneratorParams);
  }
}
