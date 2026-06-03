// @c4n/observability — barrel export.

export {
  createLogger,
  setLogSink,
  PACKAGE_NAME,
  type LogLevel,
  type LogFields,
  type LogRecord,
  type Logger,
  type LogSink,
} from "./logger.js";

export { startSpan, type Span, type SpanFields } from "./tracing.js";
