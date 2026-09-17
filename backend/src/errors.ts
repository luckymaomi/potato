export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApplicationError';
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 400, 'VALIDATION_ERROR', options);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 404, 'NOT_FOUND', options);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 409, 'CANVAS_REVISION_CONFLICT', options);
    this.name = 'ConflictError';
  }
}
