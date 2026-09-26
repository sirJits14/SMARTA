export function startResourceSubscription(subscribe, publish, emptyValue) {
  let active = true, unsubscribe = () => {};
  const fail = error => { if (active) publish({ data: emptyValue, loading: false, error }); };
  publish({ data: emptyValue, loading: true, error: null });
  try {
    unsubscribe = subscribe(data => {
      if (active) publish({ data, loading: false, error: null });
    }, fail) || (() => {});
  } catch (error) { fail(error); }
  return () => { if (active) { active = false; unsubscribe(); } };
}
