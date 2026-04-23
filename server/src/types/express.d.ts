declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      email: string;
    }

    interface Request {
      id?: string;
      user?: UserPayload;
    }
  }
}

export {};
