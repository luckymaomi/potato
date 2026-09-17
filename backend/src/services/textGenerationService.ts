import type { Logger } from '../types/core';
import type { ProviderRegistry } from '../providers';
import { AiConfigService } from './aiConfigService';
import { ValidationError } from '../errors';

export interface TextGenerationInput {
  prompt: string;
  system?: string;
  model?: string;
  provider?: string;
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class TextGenerationService {
  constructor(
    private readonly configs: AiConfigService,
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
  ) {}

  async generate(input: TextGenerationInput): Promise<string> {
    const config = this.configs.select('text', input.provider, input.model);
    const model = input.model || config.default_model || config.model[0];
    if (!model) throw new ValidationError('文本配置没有可用模型');
    const adapter = this.registry.require({ kind: 'text', config, model });
    if (!adapter.generateText) throw new ValidationError(`${adapter.descriptor.label} 不支持文本生成`);
    const result = await adapter.generateText({ config, log: this.log }, {
      model,
      messages: [
        ...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
        { role: 'user' as const, content: input.prompt },
      ],
      jsonMode: input.json,
      maxTokens: input.maxTokens,
      signal: input.signal,
    });
    return result.text;
  }
}
