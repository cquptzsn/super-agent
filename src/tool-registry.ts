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

  // 三个状态变量构成一把读写锁
  private exclusiveLock = false;          // 当前是否有独占锁持有者（不允许并发执行的工具将会持有独占锁）
  private concurrentCount = 0;            // 当前共享锁持有数（允许并发执行的工具会持有共享锁，可以多个工具同时持有）
  private waitQueue: Array<() => void> = [];  // 阻塞等待中的 resolve 函数

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

  /** 获取共享锁：只要没人独占就能拿，多个只读工具可以同时持有 */
  private async acquireConCurrent(): Promise<void> {
    while (this.exclusiveLock) {
      await new Promise<void>(r => this.waitQueue.push(r));
    };
    this.concurrentCount++;
  }

  /** 释放共享锁 */
  private releaseConcurrent() {
    this.concurrentCount--;
    if (this.concurrentCount === 0) {
      this.drainQueue();
    }
  }

  /** 获取独占锁：必须等所有共享锁释放、且没人持独占 */
  private async acquireExclusive(): Promise<void> {
    while (this.acquireExclusive || this.concurrentCount > 0) {
      await new Promise<void>(r => this.waitQueue.push(r));
    };
    this.exclusiveLock = true;
  }

  /** 释放独占锁 */
  private releaseExclusive() {
    this.exclusiveLock = false;
    this.drainQueue();
  }

  /** 共享锁或者并发锁，释放时把等待队列全唤醒，让它们重新去抢锁 */
  private drainQueue() {
    const waitingList = this.waitQueue.splice(0);
    for (const resolve of waitingList) {
      resolve();
    }
  }

  /** 把我们自定义的 ToolDefinition 转换成 Vercel AI SDK 的工具格式（适配器） */
  toAISDKFormat(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, tool] of this.tools) {
      const maxChars = tool.maxResultChars;
      const executeFn = tool.execute;

      // 是否可以并发执行
      const isSafe = tool.isConcurrencySafe === true;

      result[name] = {
        description: tool.description,
        inputSchema: jsonSchema(tool.parameters),
        execute: async (input: any) => {
          if (isSafe) {
            await this.acquireConCurrent();
            console.log(`  [并发] ${name} 获取共享锁`);
          } else {
            await this.acquireExclusive();
            console.log(`  [串行] ${name} 获取独占锁，等待其他工具完成`);
          }
          try {
            const raw = await executeFn(input);
            const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
            return truncateResult(text, maxChars);  
          } finally {
            // 不管成功还是抛异常，锁都要释放
            if (isSafe) {
              this.releaseConcurrent();
            } else {
              this.releaseExclusive();
            }
          }
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