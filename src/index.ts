import 'dotenv/config';
import { streamText, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createMockModel } from './mock-model';
import { createInterface } from 'node:readline'

const qwen = createOpenAI({
  baseURL: 'https://ws-abofm7lurquo3pjb.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

const model = process.env.DASHSCOPE_API_KEY
  ? qwen.chat('qwen-plus-latest')
  : createMockModel();

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
})

// 保存对话历史，用户问一句就 push 一句，AI 回答一次也 push 一次
const modelMessages: ModelMessage[] = []; 

function ask() {
  rl.question('请输入问题：', async (userInput: string) => {
    const trimedInput = userInput.trim();
    if (trimedInput === 'exit' || !trimedInput) {
      console.log('对话结束，再见！');
      rl.close();
      return;
    }
    
    // 这里把用户的问题保存
    modelMessages.push({
      role: 'user',
      content: trimedInput
    })
  
    let modelAnswerText = ''
    const result = streamText({
      model,
      system: '你是 Super Agent，一个专注于软件开发的 AI 助手。你说话简洁直接，喜欢用代码示例来解释问题。如果用户的问题不够清晰，你会反问而不是瞎猜',
      messages: modelMessages
    })

    console.log(); // 强制输入和模型输出中间换个行
  
    for await (const chunk of result.textStream) {
      modelAnswerText = modelAnswerText + chunk
      process.stdout.write(chunk);
    }
    

    // 这里把模型的回答保存
    modelMessages.push({
      role: 'assistant',
      content: modelAnswerText
    })

    ask();

  })
}

ask();
