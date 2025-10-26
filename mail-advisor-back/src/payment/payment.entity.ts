import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from '../auth/user.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: string;

  @Column()
  paymentKey: string;

  @Column('int')
  amount: number;

  @Column('int')
  tokens: number;

  @Column()
  status: string; // 'SUCCESS', 'FAILED', 'PENDING'

  @ManyToOne(() => User, user => user.payments)
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
