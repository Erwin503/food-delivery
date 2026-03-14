export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;
  
    constructor(message: string, statusCode = 500, isOperational = true) {
      super(message);
  
      Object.setPrototypeOf(this, new.target.prototype); // сохраняем прототип
  
      this.statusCode = statusCode;
      this.isOperational = isOperational;
  
      Error.captureStackTrace(this);
    }
  }