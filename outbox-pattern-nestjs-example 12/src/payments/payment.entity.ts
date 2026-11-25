import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('decimal')
  amount: number;

  @Column()
  currency: string;

  @Column()
  status: string;

  @Column({ unique: true })
  idempotencyKey: string;
}
