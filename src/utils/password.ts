import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = async (
  password: string,
  passwordHash: string | null | undefined
): Promise<boolean> => {
  if (!passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
};
