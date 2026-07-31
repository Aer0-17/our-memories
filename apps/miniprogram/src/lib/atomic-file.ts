export type AtomicTextFileOperations = {
  remove: (filePath: string) => Promise<void>;
  write: (filePath: string, data: string) => Promise<void>;
  read: (filePath: string) => Promise<string>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
};

export async function replaceTextFileAtomically(
  filePath: string,
  partialPath: string,
  data: string,
  operations: AtomicTextFileOperations,
  integrityError: () => Error,
) {
  await operations.remove(partialPath).catch(() => undefined);
  try {
    await operations.write(partialPath, data);
    if ((await operations.read(partialPath)) !== data) throw integrityError();
    await operations.rename(partialPath, filePath);
  } catch (error) {
    await operations.remove(partialPath).catch(() => undefined);
    throw error;
  }
}
