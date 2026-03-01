import bcryptjs from 'bcryptjs'

/**
 * Hash a password securely using bcryptjs
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10
  return await bcryptjs.hash(password, saltRounds)
}

/**
 * Compare a plaintext password with a hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcryptjs.compare(password, hash)
}
