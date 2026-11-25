import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async create(@Body() body: any) {
    const payment = await this.paymentsService.createPayment(body);
    return { message: 'Pago creado y evento publicado vía Outbox', payment };
  }
}
