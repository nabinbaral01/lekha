import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { AppModule } from './app.module';
import { installBigIntJson } from './common/bigint-json';

export async function createApp() {
  installBigIntJson();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '2mb' });

  // Serve the built web app from the same process, so office PCs just open http://<server-pc>:3000.
  const webDist = resolve(process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist'));
  if (existsSync(join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, { index: false, maxAge: '7d', setHeaders: (res, p) => p.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache') });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDist, 'index.html'));
    });
  }
  return app;
}
