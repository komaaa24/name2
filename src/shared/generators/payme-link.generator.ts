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
    `ac.selected_service=${params.planId}`,
    `a=${amountInTiyns}`,
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
  console.log('🔧 Debug - generatePaymeLink called with params:', params);

  const token = createSignedToken(params, config.PAYMENT_LINK_SECRET);
  console.log('🔧 Debug - Generated token:', token);

  const redirectUrl = buildMaskedPaymentLink(`payme?token=${token}`);
  console.log('🔧 Debug - buildMaskedPaymentLink returned:', redirectUrl);

  if (!redirectUrl) {
    console.log('🔧 Debug - No redirect URL, using direct Payme URL');
    return buildPaymeProviderUrl(params);
  }

  console.log('🔧 Debug - Returning masked payment link:', redirectUrl);
  return redirectUrl;
}

function base64Encode(input: string): string {
  return Buffer.from(input).toString('base64');
}
