export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;
    public code?: string;
  
    constructor(message: string, statusCode = 500, isOperational = true, code?: string) {
      super(message);
  
      Object.setPrototypeOf(this, new.target.prototype); // сохраняем прототип
  
      this.statusCode = statusCode;
      this.isOperational = isOperational;
      this.code = code;
  
      Error.captureStackTrace(this);
    }
  }
