/** Keep serviceability in sync even when browser address restoration emits no input event. */
export function observeCheckoutPin(
  check: (pin: string, form: HTMLFormElement | null) => void | Promise<void>,
  changed: () => void,
) {
  let field: HTMLInputElement | null = null;
  let observed = "";
  let pending: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const sync = () => {
    if (stopped || document.visibilityState === "hidden") return;
    const next = document.querySelector<HTMLInputElement>('.checkout-form input[name="postalCode"]');
    if (!next) return;
    if (next !== field) { field = next; observed = ""; }
    const pin = next.value.replace(/\D/g, "").slice(0, 6);
    if (next.value !== pin) next.value = pin;
    if (pin === observed) return;
    observed = pin;
    clearTimeout(pending);
    changed();
    if (/^[1-9][0-9]{5}$/.test(pin)) {
      pending = setTimeout(() => {
        if (!stopped && next.isConnected && next.value === pin) void check(pin, next.form);
      }, 200);
    }
  };
  document.addEventListener("input", sync);
  document.addEventListener("change", sync);
  document.addEventListener("focusin", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pageshow", sync);
  const poll = setInterval(sync, 250);
  sync();
  return () => {
    stopped = true;
    clearTimeout(pending);
    clearInterval(poll);
    document.removeEventListener("input", sync);
    document.removeEventListener("change", sync);
    document.removeEventListener("focusin", sync);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pageshow", sync);
  };
}
