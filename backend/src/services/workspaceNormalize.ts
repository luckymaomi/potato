import { ValidationError } from "../errors";
import { asRecord, readString } from "../types/core";

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function textOrNull(value: unknown): string | null {
  return readString(value) ?? null;
}

export function optionalText(
  body: Record<string, unknown>,
  key: string,
  current: string | null,
): string | null {
  return body[key] === undefined ? current : textOrNull(body[key]);
}

export function promptValue(value: unknown, emptyLabel: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError(emptyLabel);
  return value;
}

export function optionalPrompt(
  body: Record<string, unknown>,
  key: string,
  current: string,
  emptyLabel: string,
): string {
  return body[key] === undefined
    ? current
    : promptValue(body[key], emptyLabel);
}

export function asBody(input: unknown): Record<string, unknown> {
  return asRecord(input) ?? {};
}
