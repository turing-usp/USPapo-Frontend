import { agendarExclusao, desfazerExclusao, efetivarExclusoes, exclusaoPendente } from '../lib/exclusoes';

const mockExcluidas: string[] = [];
let mockFalhar = false;

jest.mock('../lib/conversations', () => ({
  excluir: async (_u: string, id: string) => {
    if (mockFalhar) throw new Error('offline');
    mockExcluidas.push(id);
  },
}));
jest.mock('../lib/cache', () => ({ esquecerConversa: async () => undefined }));

beforeEach(() => {
  jest.useFakeTimers();
  mockExcluidas.length = 0;
  mockFalhar = false;
});

afterEach(() => jest.useRealTimers());

test('a delete waits the undo window and can be undone', async () => {
  agendarExclusao('u', 'a', 6000);
  expect(exclusaoPendente('a')).toBe(true);
  expect(desfazerExclusao('a')).toBe(true);
  await jest.advanceTimersByTimeAsync(7000);
  expect(mockExcluidas).toEqual([]);
});

test('leaving commits every pending delete at once', async () => {
  const aoEfetivar = jest.fn();
  agendarExclusao('u', 'a', 6000, { aoEfetivar });
  agendarExclusao('u', 'b', 6000);
  await efetivarExclusoes();
  expect(mockExcluidas.sort()).toEqual(['a', 'b']);
  expect(aoEfetivar).toHaveBeenCalled();
  expect(exclusaoPendente('a')).toBe(false);
  expect(desfazerExclusao('a')).toBe(false);
});

test('a failed delete is reported', async () => {
  mockFalhar = true;
  const aoFalhar = jest.fn();
  agendarExclusao('u', 'c', 6000, { aoFalhar });
  await jest.advanceTimersByTimeAsync(6000);
  expect(aoFalhar).toHaveBeenCalled();
});
