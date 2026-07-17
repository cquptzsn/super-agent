import { ModelMessage, streamText } from "ai";

const MAX_STEPS = 10;

interface AgentLoopParams {
  model: any
  messages: ModelMessage[]
  system: string
  tools: any
}

export async function agentLoop(parasm: AgentLoopParams) {
  const { model,messages, system, tools } = parasm;
  let step = 0;

  while (step < MAX_STEPS) {
    step++;
    console.log(`\n******* 第 ${step} 步 *******`)

    let modelAnswerText = '';
    let hasToolCall = false;
    
    const result = streamText({
      model,
      messages,
      system,
      tools
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
          break;
        case 'tool-result':
          console.log(`\n 工具调用完成：${part.toolName}, 调用结果为：${JSON.stringify(part.output)}`);
          break;
      }
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