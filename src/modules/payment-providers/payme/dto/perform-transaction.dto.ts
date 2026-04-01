import { TransactionMethods } from '../constants/transaction-methods';

export class PerformTransactionDto {
  id?: string | number;
  method: TransactionMethods;
  params: {
    id: string;
  };
}
