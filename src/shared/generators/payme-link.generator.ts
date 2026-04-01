import { config } from '../config';
import logger from '../utils/logger';
import { buildMaskedPaymentLink } from '../utils/payment-link.util';
import { createSignedToken } from '../utils/signed-token.util';

export type PaymeLinkGeneratorParams = {
  planId: string;
  userId: string;
  amount: number;
  returnUrl?: string;
};

const PAYME_CHECKOUT_URL = 'https://checkout.paycom.uz';

export function buildPaymeProviderUrl(
  params: PaymeLinkGeneratorParams,
): string {
  const merchantId = config.PAYME_MERCHANT_ID;
  const amountAsNumber = parseFloat(params.amount.toString());
  const amountInTiyns = Math.round(amountAsNumber * 100);
  const returnUrl =
    params.returnUrl ||
    process.env.PAYME_RETURN_URL ||
    config.PAYMENT_LINK_BASE_URL ||
    '';

  logger.info('🔗 Payme link generation', {
    originalAmount: params.amount,
    amountAsNumber,
    amountInTiyns,
    planId: params.planId,
    userId: params.userId,
    merchantId, // Debug uchun qo'shamiz
  });

  if (!merchantId) {
    logger.error('❌ PAYME_MERCHANT_ID is not configured!');
    throw new Error('PAYME_MERCHANT_ID is not configured');
  }

  // Debug qo'shimcha ma'lumotlar
  console.log('Debug - merchantId:', merchantId);
  console.log('Debug - planId:', params.planId);
  console.log('Debug - userId:', params.userId);
  console.log('Debug - amountInTiyns:', amountInTiyns);
  console.log('Debug - returnUrl:', returnUrl);

  const parts = [
    `m=${merchantId}`,
    `ac.plan_id=${params.planId}`,
    `ac.user_id=${params.userId}`,
    `a=${amountInTiyns}`,
    `l=ru`,
  ];
  if (returnUrl) {
    parts.push(`c=${encodeURIComponent(returnUrl)}`);
  }
  const paramsInString = parts.join(';');
  console.log('Debug - paramsInString length:', paramsInString.length);
  console.log('Debug - paramsInString content:', paramsInString);

  logger.info('📋 Payme params string:', paramsInString);
  const encodedParams = base64Encode(paramsInString);
  console.log('Debug - encodedParams:', encodedParams);

  const finalUrl = `${PAYME_CHECKOUT_URL}/${encodedParams}`;
  console.log('Debug - PAYME_CHECKOUT_URL:', PAYME_CHECKOUT_URL);
  console.log('Debug - finalUrl:', finalUrl);

  logger.info('🔗 Final Payme URL:', finalUrl);
  return finalUrl;
}

export function generatePaymeLink(params: PaymeLinkGeneratorParams): string {
  logger.info('🔧 generatePaymeLink called', params);

  const explicitPaymentLinkBase =
    config.PAYMENT_LINK_BASE_URL?.trim() || process.env.BASE_PAYMENT_LINK_URL?.trim();

  // Public payment-link base aniq berilmagan bo'lsa, ichki/private hostga
  // redirect yasab yubormaymiz. To'g'ridan-to'g'ri Payme checkout URL qaytaramiz.
  if (!explicitPaymentLinkBase) {
    logger.warn(
      'PAYMENT_LINK_BASE_URL is empty. Returning direct Payme checkout URL instead of internal payment-link redirect.',
    );
    return buildPaymeProviderUrl(params);
  }

  const token = createSignedToken(params, config.PAYMENT_LINK_SECRET);
  const redirectUrl = buildMaskedPaymentLink(`payme?token=${token}`);

  if (!redirectUrl) {
    logger.warn(
      'Payment link base could not be resolved from PAYMENT_LINK_BASE_URL. Falling back to direct Payme checkout URL.',
    );
    return buildPaymeProviderUrl(params);
  }

  logger.info('Returning masked Payme payment link', { redirectUrl });
  return redirectUrl;
}

function base64Encode(input: string): string {
  return Buffer.from(input).toString('base64');
}
