import { Body, Controller, Post } from '@nestjs/common';
import { AdvisorService } from './advisor.service';

@Controller('advisor')
export class AdvisorController {
    constructor(private advisorservice: AdvisorService) {}

    @Post() 
    advise(@Body() body:any) {
        return this.advisorservice.advise(body)
    }

    @Post('test')
    test(@Body() body:any) {
        console.log(body) // 현재 본문 내용은 body.content로 오니까 front 수정좀 해줘야할듯
        return `내용이왔어요 : ${body}`;
    }
}
