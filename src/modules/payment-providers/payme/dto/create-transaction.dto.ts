import { TransactionMethods } from '../constants/transaction-methods';

export class CreateTransactionDto {
  id?: string | number;
  method: TransactionMethods;
  params: {
    id: string;
    time: number;
    amount: number | string;
    account: {
      user_id?: string;
      plan_id?: string;
      selected_service?: string;
      selected_sport?: string;
      order_id?: string;
    };
  };
}
