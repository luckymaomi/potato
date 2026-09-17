export type ProviderErrorCode =
  | 'configuration'
  | 'unsupported_capability'
  | 'network'
  | 'timeout'
  | 'http_error'
  | 'business_error'
  | 'invalid_response';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerId: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(input: {
    providerId: string;
    code: ProviderErrorCode;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = 'ProviderError';
    this.providerId = input.providerId;
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }
}

export function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
