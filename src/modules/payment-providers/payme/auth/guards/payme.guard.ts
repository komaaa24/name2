import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PaymeError } from '../../constants/payme-error';
import logger from '../../../../../shared/utils/logger';

// ! Payme dan kelayotgan so'rovlarni tekshirib va server xavfsizligini taminlash uchun
@Injectable()
export class PaymeBasicAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const token = this.extractTokenFromHeader(request);
    const transId = request?.body?.id;

    // Paymega qaytadigan hatolar status kodi doim 200 bo'lishi lozim !
    if (!token) {
      response.status(200).send({
        id: transId,
        error: PaymeError.InvalidAuthorization,
      });
      return false;
    }
    try {
      const decoded = this.decodeToken(token);
      if (!decoded) {
        response.status(200).send({
          id: transId,
          error: PaymeError.InvalidAuthorization,
        });
        return false;
      }

      const [username, password] = decoded.split(':');

      // Payme sandbox ba'zan username sifatida Merchant ID ni yuboradi,
      // ba'zan konfiguratsiyadagi login (PAYME_LOGIN). Ikkalasini ham qabul qilamiz.
      const sanitize = (v?: string | null) =>
        (v ?? '').trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');

      const configuredLogin = sanitize(
        this.configService.get<string>('PAYME_LOGIN'),
      );
      const merchantId = sanitize(
        this.configService.get<string>('PAYME_MERCHANT_ID'),
      );
      const isValidUsername =
        (!!configuredLogin && configuredLogin === username) ||
        (!!merchantId && merchantId === username);
      // Sandboxdan kelayotgan Basic auth ba'zan test paroli bilan bo'ladi,
      // shuning uchun ikkala env qiymatini ham qabul qilamiz.
      const prodPassword = sanitize(
        this.configService.get<string>('PAYME_PASSWORD'),
      );
      const testPassword = sanitize(
        this.configService.get<string>('PAYME_PASSWORD_TEST'),
      );

      const debugPayload = {
        username,
        password,
        configuredLogin,
        merchantId,
        prodPassword,
        testPassword,
      };
      logger.info('PAYME basic auth check', debugPayload);
      console.log('PAYME basic auth check', debugPayload);

      const isValidPassword =
        (!!prodPassword && prodPassword === password) ||
        (!!testPassword && testPassword === password);

      console.log('PAYME auth check result', {
        isValidUsername,
        isValidPassword,
      });

      if (!isValidUsername || !isValidPassword) {
        response.status(200).send({
          id: transId,
          error: PaymeError.InvalidAuthorization,
        });
        return false;
      }
    } catch {
      response.status(200).send({
        id: transId,
        error: PaymeError.InvalidAuthorization,
      });
      return false;
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers['authorization']?.split(' ') ?? [];

    return type === 'Basic' ? token : undefined;
  }

  private decodeToken(token: string) {
    return token?.length > 0 ? atob(token) : undefined;
  }
}
