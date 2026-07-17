// ！！！！工具的 description 和 inputSchema 的 description 本质上就是在写 prompt，
// 写得越清楚、越具体，模型调用的准确率越高

import { jsonSchema } from 'ai';

/**
 * desc: 模拟的一个供模型使用的天气查询工具
 * 一个工具主要包含 3 部分：
 * description: 告诉模型这个工具是干啥的（模型靠这个判断什么时候可以调用这个工具）
 * inputSchema: 告诉模型这个工具接收什么参数（通过 JSON Schema 定义）
 * execute: 实际执行函数
 */
export const weatherTool = {
  description: '查询指定城市的天气信息',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称，比如：”背景“、”上海“' }
    },
    required: ['city'],
    additionalProperties: false
  }),
  // execute 的返回值最终会被序列化成「字符串」返回给模型，供模型分析判断
  execute: async ({ city }: { city: string }) => {
    const mockWeather: Record<string, string> = {
      '北京': '晴，15-25°C，东南风 2 级',
      '上海': '多云，18-22°C，西南风 3 级',
      '深圳': '阵雨，22-28°C，南风 2 级',
    }
    return mockWeather[city] || `${city}：暂无数据`
  }
}

export const calculatorTool = {
  description: '计算数学表达式的结果。当用户提问涉及数学运算时使用',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      expression: { type: 'string', description: '数学表达式，如 "2 + 3 * 4"' },
    },
    required: ['expression'],
    additionalProperties: false,
  }),
  execute: async ({ expression }: { expression: string }) => {
    try {
      // 生产环境不要用 eval，这里纯粹为了演示
      const result = new Function(`return ${expression}`)();
      return `${expression} = ${result}`;
    } catch {
      return `无法计算: ${expression}`;
    }
  },
};