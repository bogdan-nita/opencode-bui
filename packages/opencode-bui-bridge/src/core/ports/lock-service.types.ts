export type LockHandle = {
  release: () => Promise<void>;
};

export interface LockService {
  acquire(path: string): Promise<LockHandle>;
}
