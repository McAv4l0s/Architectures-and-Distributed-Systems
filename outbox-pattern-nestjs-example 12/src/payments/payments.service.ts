import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './payment.entity';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    private outboxService: OutboxService,
  ) {}

  async createPayment(body: any) {
    this.logger.log(`Creando pago: ${body.idempotencyKey}`);

    const payment = this.paymentRepo.create({
      amount: body.amount,
      currency: body.currency,
      status: 'pending',
      idempotencyKey: body.idempotencyKey,
    });

    const saved = await this.paymentRepo.save(payment);

    await this.outboxService.saveEvent('payment', saved.id, 'PaymentInitiated', {
      paymentId: saved.id,
      amount: saved.amount,
      currency: saved.currency,
    });

    return saved;
  }
}
