export function createActionRunner(publish) {
  const pending = new Set();
  const errors = {};
  const emit = () => publish({ pending: [...pending], errors: { ...errors } });
  return { async run(key, work) {
    if (pending.has(key)) return { ok: false, busy: true };
    pending.add(key); delete errors[key]; emit();
    try { return { ok: true, value: await work() }; }
    catch (error) { errors[key] = 'The action could not be completed. Your entries are still here. Please try again.'; return { ok: false, error }; }
    finally { pending.delete(key); emit(); }
  } };
}
