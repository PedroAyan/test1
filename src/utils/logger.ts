export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private level: LogLevel = 'info') {}

  private shouldLog(level: LogLevel) {
    return levelWeights[level] >= levelWeights[this.level];
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };
    console.log(JSON.stringify(payload));
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('error', message, data);
  }
}
