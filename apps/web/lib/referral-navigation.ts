/** Wait for the cookie response, but keep shopping available if attribution is unavailable. */
export function startReferralNavigation(capture: Promise<unknown>, navigate: () => void) {
  let active = true;
  const finish = () => {
    if (!active) return;
    active = false;
    clearTimeout(timeout);
    navigate();
  };
  const timeout = setTimeout(finish, 3000);
  void capture.then(finish, finish);
  return () => {
    active = false;
    clearTimeout(timeout);
  };
}
