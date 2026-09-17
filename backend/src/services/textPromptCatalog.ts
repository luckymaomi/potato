import { ValidationError } from '../errors';

export type TextPromptKey =
  | 'generate-text'
  | 'write-script'
  | 'extract-characters'
  | 'extract-scenes'
  | 'extract-props'
  | 'split-storyboards';

export interface TextPromptDefinition {
  key: TextPromptKey;
  label: string;
  description: string;
  system_prompt: string;
  placeholders: string[];
}

const promptCatalog: readonly TextPromptDefinition[] = [
  {
    key: 'generate-text',
    label: '通用文本生成',
    description: '根据输入要求生成或整理文本，不绑定短剧数据记录。',
    system_prompt: '根据用户输入生成清晰、可直接使用的中文文本。忠实遵循格式和内容要求，不要解释创作过程。',
    placeholders: [],
  },
  {
    key: 'write-script',
    label: '编写剧本',
    description: '把故事想法写成可直接拍摄的场次、动作和对白。',
    system_prompt: '你是短剧编剧。输出可直接拍摄的中文短剧剧本，包含场次、人物动作和对白，不要解释创作过程。',
    placeholders: [],
  },
  {
    key: 'extract-characters',
    label: '提取角色资产',
    description: '从剧本识别需要跨镜头保持一致的主要角色。',
    system_prompt: '从剧本提取主要角色。只输出 JSON：{"items":[{"name":"角色名","description":"身份与性格","appearance":"稳定的外观提示词"}]}。',
    placeholders: [],
  },
  {
    key: 'extract-scenes',
    label: '提取场景资产',
    description: '从剧本识别需要跨镜头保持一致的拍摄场景。',
    system_prompt: '从剧本提取拍摄场景。只输出 JSON：{"items":[{"location":"场景名","prompt":"环境、时间、光线、构图提示词"}]}。',
    placeholders: [],
  },
  {
    key: 'extract-props',
    label: '提取道具资产',
    description: '从剧本识别影响剧情或需要保持一致的关键道具。',
    system_prompt: '从剧本提取影响剧情或需要保持一致的道具。只输出 JSON：{"items":[{"name":"道具名","description":"剧情用途","prompt":"外观生成提示词"}]}。',
    placeholders: [],
  },
  {
    key: 'split-storyboards',
    label: '拆分分镜清单',
    description: '把一集剧本拆成连续、可拍摄的镜头清单。',
    system_prompt: '把剧本拆成连续可拍摄分镜。{{storyboard_count_instruction}}每个分镜必须只列出该画面实际出现的角色、场景和道具名称，不要把未入画资产加入。只输出 JSON：{"items":[{"title":"镜头标题","description":"画面内容","action":"动作","dialogue":"对白","image_prompt":"静态画面提示词","video_prompt":"运动与镜头提示词","duration":4,"characters":["角色名"],"scenes":["场景名"],"props":["道具名"]}]}。',
    placeholders: ['storyboard_count_instruction'],
  },
] as const;

export function listTextPrompts(): TextPromptDefinition[] {
  return promptCatalog.map((prompt) => ({ ...prompt, placeholders: [...prompt.placeholders] }));
}

export function defaultSystemPrompt(key: TextPromptKey): string {
  const definition = promptCatalog.find((prompt) => prompt.key === key);
  if (!definition) throw new ValidationError(`未知文本提示词：${key}`);
  return definition.system_prompt;
}

export function resolveSystemPrompt(
  key: TextPromptKey,
  customPrompt: string | undefined,
  variables: { storyboardCount?: number } = {},
): string {
  const template = customPrompt?.trim() || defaultSystemPrompt(key);
  const countInstruction = variables.storyboardCount
    ? `必须输出恰好 ${variables.storyboardCount} 个分镜。`
    : '根据剧情选择合理的分镜数量。';
  return template.replaceAll('{{storyboard_count_instruction}}', countInstruction);
}
