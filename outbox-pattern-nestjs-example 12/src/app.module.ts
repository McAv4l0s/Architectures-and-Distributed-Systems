import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsModule } from './payments/payments.module';
import { OutboxModule } from './outbox/outbox.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fintech',
      autoLoadEntities: true,
      synchronize: true,
    }),
    PaymentsModule,
    OutboxModule,
  ],
})
export class AppModule {}
