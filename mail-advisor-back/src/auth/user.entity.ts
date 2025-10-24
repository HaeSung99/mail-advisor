import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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
}
