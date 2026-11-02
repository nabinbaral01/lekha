import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Devanagari data requires a UTF8 database (Windows defaults to WIN1252).
    const [{ server_encoding }] = await this.$queryRaw<{ server_encoding: string }[]>`SHOW server_encoding`;
    if (server_encoding !== 'UTF8') throw new Error(`Database encoding must be UTF8 (found ${server_encoding}). Recreate it with ENCODING 'UTF8'.`);
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
