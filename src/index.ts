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
      prompt: modelMessages
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
