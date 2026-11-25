import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Outbox } from './outbox.entity';
import * as amqp from 'amqplib';

@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly logger = new Logger(OutboxService.name);
  private channel: any;

  constructor(
    @InjectRepository(Outbox)
    private outboxRepo: Repository<Outbox>,
  ) {}

  async onModuleInit() {
    const conn: any = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672');
    this.channel = await conn.createChannel();
    await this.channel.assertExchange('fintech.events', 'topic', { durable: true });
    this.startRelay();
  }

  async saveEvent(aggregateType: string, aggregateId: string, eventType: string, payload: any) {
    return this.outboxRepo.save({ aggregateType, aggregateId, eventType, payload });
  }

  private startRelay() {
    setInterval(async () => {
      const events = await this.outboxRepo.find({ where: { publishedAt: null }, take: 10 });
      for (const e of events) {
        this.channel.publish('fintech.events', `${e.aggregateType}.${e.eventType}`, Buffer.from(JSON.stringify(e.payload)));
        e.publishedAt = new Date();
        await this.outboxRepo.save(e);
        this.logger.log(`Evento publicado: ${e.eventType}`);
      }
    }, 2000);
  }
}
