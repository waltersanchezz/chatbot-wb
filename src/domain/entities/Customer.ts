import type { Channel } from '../../shared/types';

export interface Customer {
  id: string;
  phone: string;
  name?: string;
  channel: Channel;
  createdAt: Date;
  updatedAt: Date;
}
