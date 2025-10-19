import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AdvisorService {
    private client = new OpenAI(); // 환경변수 자동 사용
    async advise(body: any){

        
        // console.log(process.env.OPENAI_API_KEY)
        // console.log(body.text)
        /*
        [ROLE]
        - 나의 포지션: ${body.my_position}
        - 나의 직업: ${body.my_job}

        [TONE]
        - 말투 레벨: ${body.tone_level}

        [CONSTRAINTS]
        - 가이드: ${body.guide}

        [TASK]
        - 작업 유형: ${body.task_type}
        - 목적/맥락: ${body.my_goal}
        - 대상 독자: ${body.audience}
        */
        const res = await this.client.responses.create({
            model: 'gpt-5-nano',

            instructions: 
            `
            my_position:  ${body.my_position ?? "모름"},
            my_job:       ${body.my_job ?? "모름"},
            tone_level:   ${body.tone_level ?? "모름"},
            guide:        너는 최고의 메일 교정 도우미다.
                            -원문 의미/방향성 유지
                            -접두사/머리말/설명/코멘트 없이, 교정된 문장만 그대로 출력
                            ,
            task_type:    메일 교정,
            goal:         ${body.my_goal ?? "메일 교정"},
            audience:     ${body.audience ?? "모름"}
            `,

            input: body.text,

            reasoning: { effort: 'low' } // 개발환경에서 추론토큰양을 낮게 설정하기위한 명령어
        })
        console.log(res)
        const result = {
            output : res.output_text,
            token : res.usage?.total_tokens ?? '알수없음',
        }
        return result
    }
}
