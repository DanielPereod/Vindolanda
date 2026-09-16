/** Serializes document writes; failures do not prevent retries. */
export function createSaveQueue<Value>(write: (value: Value) => Promise<void>) {
  let pending: Promise<void> | undefined;
  return (value: Value): Promise<void> => {
    const operation = pending
      ? pending.catch(() => undefined).then(() => write(value))
      : write(value);
    pending = operation;
    return operation;
  };
}
