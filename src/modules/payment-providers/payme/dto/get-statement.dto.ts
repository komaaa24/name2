import { TransactionMethods } from '../constants/transaction-methods';

export class GetStatementDto {
  id?: string | number;
  method: TransactionMethods;
  params: {
    from: number;
    to: number;
  };
}
