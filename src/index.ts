import 'dotenv/config';
import { type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createMockModel } from './mock-model';
import { createInterface } from 'node:readline'
import { weatherTool, calculatorTool } from './tools/utility-tools';
import { agentLoop } from './agent/loop';

const SYSTEM = `你是 Super Agent，一个有工具调用能力的 AI 助手。
需要查询信息时，主动使用工具，不要编造数据。
回答要简洁直接。`;

const qwen = createOpenAI({
  baseURL: 'https://ws-abofm7lurquo3pjb.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

const model = process.env.DASHSCOPE_API_KEY
  ? qwen.chat('qwen-plus-latest')
  : createMockModel();

const tools = { get_weather: weatherTool, caulate: calculatorTool }

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
  
    await agentLoop({
      messages: modelMessages,
      model,
      system: SYSTEM,
      tools
    })

    console.log() // 换行

    ask();

  })
}

ask();
