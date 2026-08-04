import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable the default body-parser and raise the limit for large specs (OpenAPI import, etc.).
  // Accept JSON only: the web app communicates entirely via application/json and there is no
  // form (urlencoded) receiving endpoint. The urlencoded parser is not only unused, it also opens
  // a "simple request" path that cross-origin pages can send without a preflight, which could
  // trigger /execute (blind SSRF). JSON-only means cross-origin calls always go through a preflight
  // and are blocked (since CORS is not opened).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '25mb' }));

  // The frontend (nginx) proxies to /api, so set the global prefix.
  app.setGlobalPrefix('api');

  // CORS is intentionally not opened. The web app talks only through the nginx same-origin (/api)
  // proxy, so CORS is not needed; reflecting the origin (origin:true) would let any website the user
  // visits read stored tokens, card numbers, and history cross-origin. (For a no-auth local tool,
  // not opening CORS is the only thing preventing cross-origin reads.)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`api-tester server listening on :${port}`);
}
bootstrap();
