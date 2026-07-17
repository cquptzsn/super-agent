import { ModelMessage, streamText } from "ai";
import { detect, recordCall, recordResult, resetHistory } from '../loop-detection'

const MAX_STEPS = 15;

interface AgentLoopParams {
  model: any
  messages: ModelMessage[]
  system: string
  tools: any
}

export async function agentLoop(parasm: AgentLoopParams) {
  const { model,messages, system, tools } = parasm;
  let step = 0;
  resetHistory();

  while (step < MAX_STEPS) {
    step++;
    console.log(`\n******* 第 ${step} 步 *******`)

    let modelAnswerText = '';
    let hasToolCall = false;
    let shouldBreak = false;
    let lastToolCall: { name: string, input: unknown } | null = null
    
    const result = streamText({
      model,
      messages,
      system,
      tools,
      maxRetries: 0,
      onError: () => {},
    })

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

    if (shouldBreak) {
      console.log(`\n [循环检测触发，Agent 已停止]`);
      break;
    }

    const stepMessages = await result.response
    // 这里的 stepMessages.messages 是一个数组，包含模型在这一步产生的所有消息：模型恢复、工具调用、工具调用结果等...
    messages.push(...stepMessages.messages)

    if (!hasToolCall) {
      break;
    }

    console.log('\n模型将会继续执行下一步 ============>');
  }

  if (step >= MAX_STEPS) {
    console.log('模型执行步数超过最大限制');
  }
}