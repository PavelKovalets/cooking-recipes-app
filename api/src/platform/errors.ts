/**
 * Consistent JSON error shape across the API.
 *
 * Every error response is: { "error": { "code": string, "message": string,
 * "details"?: unknown } } with an appropriate HTTP status.
 */

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "unauthorized", message);
  }
  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(403, "forbidden", message);
  }
  static notFound(message = "Not found"): ApiError {
    return new ApiError(404, "not_found", message);
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, "conflict", message, details);
  }
  static payloadTooLarge(message = "Payload too large"): ApiError {
    return new ApiError(413, "payload_too_large", message);
  }
  static unsupportedMediaType(message = "Unsupported media type"): ApiError {
    return new ApiError(415, "unsupported_media_type", message);
  }
}
