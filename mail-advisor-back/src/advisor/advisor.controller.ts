import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { AdvisorService } from './advisor.service';
import { UsersRepository } from '../auth/user.repository';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('advisor')
export class AdvisorController {
    constructor(
        private advisorservice: AdvisorService,
        private usersRepo: UsersRepository
    ) {}

    @Post()
    @UseGuards(JwtAuthGuard)
    advise(@Body() body: { content: string; [key: string]: any }, @Request() req: any) {
        // JWT에서 username 추출
        const username = req.user.username;
        return this.advisorservice.advise(body, username)
    }

    @Post('test')
    test(@Body() body:any) {
        console.log(body) // 현재 본문 내용은 body.content로 오니까 front 수정좀 해줘야할듯
        return `내용이왔어요 : ${body}`;
    }

    @Post('token/increase') // 추후 결제 했을때 토큰 추가해주는 로직
    @UseGuards(JwtAuthGuard)
    increaseToken(@Body() body: { amount: number }, @Request() req: any) {
        const username = req.user.username;
        return this.usersRepo.increaseTokenAmount(username, body.amount);
    }
}
