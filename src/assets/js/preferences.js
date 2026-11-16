export function preference(scope, name) {
  const key = 'dzsufizio.' + name + ':' + scope;
  return {
    read() {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    write(value) {
      try { localStorage.setItem(key, String(value)); } catch { /* Works for the current page. */ }
    },
  };
}
