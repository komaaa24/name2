import { TransactionMethods } from '../constants/transaction-methods';

export class CancelTransactionDto {
  id?: string | number;
  method: TransactionMethods;
  params: {
    id: string;
    reason: number;
  };
}
