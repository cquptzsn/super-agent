import 'dotenv/config';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createMockModel } from './mock-model';

const qwen = createOpenAI({
  baseURL: 'https://ws-abofm7lurquo3pjb.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY,
});

const model = process.env.DASHSCOPE_API_KEY
  ? qwen.chat('qwen-plus-latest')
  : createMockModel();

async function main() {
  const result = streamText({
    model,
    prompt: '在编写rn组件的时候需要注意什么',
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log(); // 仅用于换行
}

main();
