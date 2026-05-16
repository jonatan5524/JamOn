export const delay = <T>(value: T, ms = 600): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));
