import { ModelMessage, streamText } from "ai";
import { detect, recordCall, recordResult, resetHistory } from '../loop-detection'
import { isRetryable, calculateDelay, sleep }  from '../retry'
import { ToolRegistry } from "../tool-registry";

const MAX_STEPS = 15;
const MAX_RETRIES = 5;

export interface Budget {
  used: number
  limit: number
}

interface AgentLoopParams {
  model: any
  /** 对话、模型生成历史 */
  messages: ModelMessage[]
  system: string
  registry: ToolRegistry
  budget: Budget
}

export async function agentLoop(parasm: AgentLoopParams) {
  const { model, messages, system, registry, budget } = parasm;
  let step = 0;
  resetHistory();

  while (step < MAX_STEPS) {
    step++;
    console.log(`\n******* 第 ${step} 步 *******`)

    let modelAnswerText = '';
    let hasToolCall = false;
    let shouldBreak = false;
    let lastToolCall: { name: string, input: unknown } | null = null
    let stepResponse: Awaited<ReturnType<typeof streamText>['response']>;
    let stepUsage: Awaited<ReturnType<typeof streamText>['usage']>;
    
    const result = streamText({ 
      model, 
      system, 
      tools: registry.toAISDKFormat(),
      messages, 
      maxRetries: 0,
      providerOptions: { openai: { parallelToolCalls: true } }, onError: () => {} });

    // API 容错，步骤级重试
    for (let attempt = 1; ; attempt++) {
      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              process.stdout.write(part.text);
              modelAnswerText = modelAnswerText + part.text
              break;
    
            case 'tool-call': 
              console.log(`\n 调用工具：${part.toolName}, 传入的参数为：${JSON.stringify(part.input)}`);
              hasToolCall = true;
              lastToolCall = { name: part.toolName, input: part.input }
              const detection = detect(part.toolName, part.input)
              if (detection.stuck) {
                console.log(detection.message);
                if (detection.level === 'critical') {
                  shouldBreak = true;
                } else {
                  messages.push({
                    role: 'user' as const,
                    content: `系统提醒：${detection.message}。请换个解决思路，不要重复同样的操作。`
                  })
                }
              }
              recordCall(part.toolName, part.input)
              break;
    
            case 'tool-result':
              console.log(`\n 工具调用完成：${part.toolName}, 调用结果为：${JSON.stringify(part.output)}`);
              if (lastToolCall) {
                recordResult(part.toolName, part.input, part.output);
              }
              break;
          }
        } 

        // 这里的 stepMessages.messages 是一个数组，包含模型在这一步产生的所有消息：模型恢复、工具调用、工具调用结果等...
        stepResponse = await result.response;
        stepUsage = await result.usage;
        break;
      } catch (error) {
        console.log('error => ', JSON.stringify(error))
        if (attempt > MAX_RETRIES || !isRetryable(error as Error)) throw error;
        const delay = calculateDelay(attempt);
        console.log(`  [重试] 第 ${attempt}/${MAX_RETRIES} 次失败，${delay}ms 后重试...`);
        await sleep(delay);
        hasToolCall = false; modelAnswerText = ''; shouldBreak = false; lastToolCall = null;
      }
    }

    if (shouldBreak) {
      console.log(`\n [循环检测触发，Agent 已停止]`);
      break;
    }
    

    messages.push(...stepResponse.messages);

    // Token 预算追踪：budget 由调用方持有，跨轮持续累计
    // @ts-ignore
    const inp = typeof stepUsage?.inputTokens === 'number' ? stepUsage.inputTokens : (stepUsage?.inputTokens?.total ?? 0);
    // @ts-ignore
    const out = typeof stepUsage?.outputTokens === 'number' ? stepUsage.outputTokens : (stepUsage?.outputTokens?.total ?? 0);
    budget.used = inp + out;
    const pct = Math.round(budget.used / budget.limit*100);
    console.log(`[Token] ${budget.used}/${budget.limit} (${pct}%)`);
    if (budget.used > budget.limit) {
      console.log('\n[Token 预算耗尽，强制停止]');
      break;
    }

    if (!hasToolCall) {
      break;
    }

    console.log('\n模型将会继续执行下一步 ============>');
  }

  if (step >= MAX_STEPS) {
    console.log('模型执行步数超过最大限制');
  }
}