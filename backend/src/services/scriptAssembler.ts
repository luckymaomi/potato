import { ValidationError } from '../errors';

export interface ScriptSceneDraft {
  title?: unknown;
  content?: unknown;
}

export function assembleScriptScenes(input: unknown): string {
  if (!Array.isArray(input)) throw new ValidationError('请先填写场次');
  const scenes = input
    .map((item) => item && typeof item === 'object' ? item as ScriptSceneDraft : {})
    .map((scene) => ({
      title: typeof scene.title === 'string' ? scene.title.trim() : '',
      content: typeof scene.content === 'string' ? scene.content.trim() : '',
    }))
    .filter((scene) => scene.title || scene.content);
  if (!scenes.length) throw new ValidationError('请先填写场次');
  return scenes.map((scene) => [scene.title, scene.content].filter(Boolean).join('\n')).join('\n\n');
}
