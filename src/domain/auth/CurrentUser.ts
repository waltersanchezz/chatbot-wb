import { AsyncLocalStorage } from 'async_hooks';
import type { AuthUserView } from './userDto';

const storage = new AsyncLocalStorage<AuthUserView>();

/**
 * Usuario autenticado del request (ALS).
 * ConversationEngine / motores NO leen esto.
 */
export const CurrentUser = {
  run<T>(user: AuthUserView, fn: () => T): T {
    return storage.run(user, fn);
  },

  get(): AuthUserView | null {
    return storage.getStore() ?? null;
  },

  require(): AuthUserView {
    const user = storage.getStore();
    if (!user) throw new Error('CurrentUser ausente');
    return user;
  },
};
