import { jsonSchema, Tool } from 'ai';

export interface ToolDefinition {
  // 前 3 个属性定义工具，供模型使用
  /** 工具名称 */
  name: string;
  /** 工具介绍 */
  description: string;
  /** 工具参数 */
  parameters: Record<string, unknown>;

  // 后 3 个属性给 agent 用，让 agent 知道怎么管理工具
  /** 能否并行 */
  isConcurrencySafe?: boolean;
  /** 能否只读 */
  isReadOnly?: boolean;
  /** 结果最大长度 */
  maxResultChars?: number;

  /** 工具的执行函数，真正干活的代码 */
  execute: (input: any) => Promise<unknown>;
}

const DEFAULT_MAX_RESULT_CHARS = 3000;

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(...tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 把我们自定义的 ToolDefinition 转换成 Vercel AI SDK 的工具格式（适配器） */
  toAISDKFormat(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, tool] of this.tools) {
      const maxChars = tool.maxResultChars;
      const executeFn = tool.execute;
      result[name] = {
        description: tool.description,
        inputSchema: jsonSchema(tool.parameters),
        execute: async (input: any) => {
          const raw = await executeFn(input);
          const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
          return truncateResult(text, maxChars);
        },
      };
    };
    return result;
  }
}

/** 如果工具返回的内容太长，就保留前面一部分和后面一部分，把中间省略掉。 */
export function truncateResult(text: string, maxChars: number = DEFAULT_MAX_RESULT_CHARS): string {
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize;
  const head = text.slice(0, headSize);
  const tail = text.slice(-tailSize);
  const dropped = text.length - headSize - tailSize;

  return `${head}\n\n... [省略 ${dropped} 字符] ...\n\n${tail}`;
}