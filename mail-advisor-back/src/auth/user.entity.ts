import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Payment } from '../payment/payment.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ default: 10000 })
  tokenAmount: number;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @OneToMany(() => Payment, payment => payment.user)
  payments: Payment[];
}
