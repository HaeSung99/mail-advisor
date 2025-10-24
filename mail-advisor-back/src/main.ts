import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 개발용(대충 다 허용) — 빨리 확인할 때
  app.enableCors();

  // 운영/반운영 권장: 필요한 Origin만 명시
  // app.enableCors({
  //   origin: [
  //     'http://localhost:3000',      // 네 서버 자체 호출 테스트
  //     'https://mail.naver.com',     // 콘텐츠 스크립트의 Origin (네이버 메일) pageUrl 아마 'https://mail.naver.com/v2/new' 일꺼임
  //     // 필요 시 추가: 'http://localhost:5173', 등
  //   ],
  //   methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  //   allowedHeaders: ['Content-Type','Authorization'],
  //   credentials: false,             // 쿠키/인증 필요 없으면 false
  //   maxAge: 86400,                  // preflight 캐시(초)
  // });

  await app.listen(process.env.PORT || 3000);
  console.log(`서버 실행중 Port : ${process.env.PORT || 3000}`);
}
bootstrap();
