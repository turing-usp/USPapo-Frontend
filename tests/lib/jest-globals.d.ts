/**
 * Minimal ambient Jest typings for this repo.
 *
 * The project does not install `@types/jest` (the environment is offline and
 * the dependency set is frozen), so this declaration file types exactly the
 * Jest globals the tests in `tests/` use. It is ambient (no top-level
 * import/export): it is visible to every file tsc checks. If `@types/jest`
 * ever lands in node_modules, delete this file.
 */

interface JestMatchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeInstanceOf(ctor: unknown): void;
  toThrow(message?: string | RegExp): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeGreaterThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toHaveLength(length: number): void;
  toBeDefined(): void;
  toContain(item: unknown): void;
  toHaveBeenCalled(): void;
  toHaveBeenCalledTimes(count: number): void;
  not: JestMatchers;
  rejects: JestMatchers;
  resolves: JestMatchers;
}

declare function describe(name: string, fn: () => void | Promise<void>): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;
declare function expect(actual: unknown): JestMatchers;

declare namespace jest {
  /** A fake function with call tracking (the subset the tests use). */
  interface MockInstance<T, Args extends unknown[]> {
    (...args: Args): T;
    mock: { calls: Args[]; length: number };
    mockResolvedValue(value: T | Awaited<T> | PromiseLike<T>): this;
    mockRejectedValue(reason: unknown): this;
    mockReturnValueOnce(value: T): this;
    mockRejectedValueOnce(reason: unknown): this;
    mockImplementation(fn: (...args: Args) => T | PromiseLike<T>): this;
  }

  /** A fake function; `Args` is the argument tuple for call-site typing. */
  type Mock<T = unknown, Args extends unknown[] = unknown[]> = MockInstance<T, Args>;

  const fn: <T = unknown, Args extends unknown[] = unknown[]>(
    impl?: (...args: Args) => T | PromiseLike<T>,
  ) => Mock<T, Args>;
  const mock: (path: string, factory?: () => unknown) => void;
}
