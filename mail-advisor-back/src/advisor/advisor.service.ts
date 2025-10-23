import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AdvisorService {
  private client = new OpenAI(); // 환경변수 자동 사용

  // (선택) 흔한 누설 방지용 가벼운 클린업: 앞뒤 ``` 코드펜스/따옴표/레이블 제거
  private sanitize(output: string): string {
    let t = output.trim();
    // ```...``` 제거
    if (t.startsWith('```')) {
      t = t.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    // "수정본:", "Rewritten:" 같은 레이블 제거
    t = t.replace(/^(수정본|최종본|Rewritten|Edited)\s*:\s*/i, '').trim();
    // 양끝 큰따옴표만 남았을 때 제거
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('"') && t.endsWith('"'))) {
      t = t.slice(1, -1).trim();
    }
    return t;
  }


  async advise(body: any) {
    const instruction = `
        너는 사용자가 작성한 이메일 초안을 기반으로, 글의 목적을 가장 효과적으로 달성하도록 발전시키는 **적극적인 이메일 파트너**다.  
        단순히 문법을 고치거나 말투를 정리하는 수준이 아니라, 사용자의 의도와 목표를 명확히 드러내며  
        받는 사람이 이해하기 쉽고 긍정적으로 반응하게끔 본문을 재구성해야 한다.

        [핵심 규칙]
        - 결과는 ‘최종 수정된 본문’만 출력한다. 앞/뒤 설명, 선택지, 메모, 제목 제안, 불릿, 마크다운 코드펜스 금지.
        - 단 하나의 최종안만 출력한다.
        - 원문(raw input)의 언어를 그대로 사용한다(한국어면 한국어, 영어면 영어).
        - 원문이 전달하려는 **의도와 감정의 결**은 유지하되, 메시지를 더 명확하고 설득력 있게 발전시킨다.
        - 사용자가 제공하지 않은 사실(고유명사/수치/일정 등)은 창작하지 않는다. 불확실한 부분은 일반적 표현으로 자연스럽게 처리.
        - 시간이나 약속같은건 변경하지말고 따로 추가/제거 하지도 말아야한다.
        - 문장은 매끄럽고, 단락은 명확하게 구분하되 문체는 자연스럽고 읽기 쉬워야 한다.
        - 문단은 의미 단위로 나누고 문단 사이에는 빈 줄 1줄만 둔다. 임의 줄바꿈, 들여쓰기, 머릿기호(-, *) 금지.
        - 문장이 끝날 때마다 줄바꿈을 해야 함
        - 예시 형태:
          안녕하세요.
          이번에 프로젝트 진행 상황을 공유드리고자 합니다.
          다음 주까지 완료 예정입니다.
          
          감사합니다.

        [톤앤매너]
        - tone_level=formal        : 정중하고 전문적인 비즈니스 문체, 핵심만 간결히 전달.
        - tone_level=friendly      : 따뜻하고 부드럽게, 진심이 느껴지도록 자연스러운 문체.
        - tone_level=casual        : 편안하고 자연스럽게, 다만 과도한 표현·속어 금지.
        - tone_level=authoritative : 자신감 있고 단정한 문체, 신뢰감이 느껴지게.
        - tone_level=persuasive    : 상대가 공감하고 납득할 수 있게 설득 논리 강화.
        - tone_level=urgent        : 시급성을 분명히 표현하되, 조급한 인상은 주지 않게.

        [길이 정책]
        - short      : 내용 압축, 핵심만 남기고 불필요한 예의 표현 최소화.
        - similar    : 원문과 비슷한 분량 유지, 문장만 정리.
        - long       : 필요 시 추가 근거·맥락을 덧붙여 메시지 명확히.
        - optimized  : 수신자의 이해와 반응 가능성을 기준으로 가장 자연스럽게 구성.

        [목표]
        - proposal     : 제안의 가치와 기대 효과를 강조하고, 다음 단계(콜/미팅/자료 공유) 유도.
        - follow-up    : 이전 맥락 요약 후 핵심 요청·진행 사항 간결히 전달.
        - meeting      : 목적·안건·기대 결과 중심으로, 일정 조율 문장 포함.
        - feedback     : 검토 요청 포인트를 명확히 하고, 상대의 의견을 유도.
        - approval     : 승인 필요 배경·이유를 명확히 설명하고 근거 제시.
        - information  : 핵심 정보만 선별, 불필요한 장문 지양.
        - apology      : 사과 이유와 후속 조치를 구체적으로 명시.
        - thanks       : 감사 사유를 구체적으로 표현하되 과장 금지.

        [대상]
        - customer     : 공감과 신뢰를 주는 어조, 전문 용어는 줄이고 이해하기 쉽게.
        - colleague    : 간결하고 명확하게, 역할·기대 행동을 구체적으로.
        - boss         : 결론·요청·결정 포인트 우선 제시, 불필요한 장문 금지.
        - subordinate  : 기대 결과·기한 명확히, 존중감 있는 어조.
        - partner      : 상호이익 중심, 긍정적·협력적 어조.
        - vendor       : 조건·기한·품질 기준 명확히, 예의 유지.
        - investor     : 신뢰와 확신이 느껴지게, 핵심 수치·비전 명확히.
        - media        : 간결하고 인용 가능한 문장 중심.

        [컨텍스트(출력에 노출 금지)]
        - my_position: ${body.my_position ?? '모름'}
        - my_job: ${body.my_job ?? '모름'}
        - tone_level: ${body.tone_level ?? 'formal'}
        - my_goal: ${body.my_goal ?? 'proposal'}
        - audience: ${body.audience ?? 'partner'}
        - text_length: ${body.text_length ?? 'optimized'}

        항상 사용자의 목적이 가장 잘 전달되는 방향으로 문장을 적극적으로 개선하고,  
        본문 외의 설명이나 주석은 포함하지 말 것.
        `.trim();

    const client_text = body.content ?? ''; // 원문 전체

    const res = await this.client.responses.create({
      model: 'gpt-5',
      instructions: instruction, // 규칙은 여기, 원문은 input으로만 보냄
      input: client_text,        // "본문만 내놔"를 보장하려면 원문은 input 단독으로
      // temperature/top_p는 기본값 사용(원하면 낮게 조절)
      // temperature: 0.3, 랜덤성(창의성) 조절. 낮을수록 보수적/일관, 높을수록 다양/창의
      /* top_p: 0.9,이때 top-p = 0.8이면,
        확률을 큰 순서로 더해 가며 누적합이 0.8이 되는 지점까지만 남김
        감사합니다(0.45) + 고맙습니다(0.25) + 수고하세요(0.15) = 0.85
        누적이 0.8을 넘었으니 이 세 단어만 후보로 남기고, 그 안에서 확률 비율에 따라 무작위로 샘플링하는 거 */
      max_output_tokens: 1000,    // 출력 길이 상한(악의적 장문 일부 차단)
      reasoning: { effort: 'low' }
    });

    const raw = res.output_text ?? '';
    const cleaned = this.sanitize(raw); // 선택적 후처리

    console.log(res)

    return {
      output: cleaned, // AI가 이미 올바른 형태로 출력
      token: res.usage?.total_tokens ?? '알수없음',
    };
  }
}
