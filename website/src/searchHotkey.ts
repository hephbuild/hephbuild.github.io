/**
 * "/" key → focus the docs search field.
 *
 * The blueprint DocTopNav renders a "/" key-hint chip inside the search box;
 * this wires up the matching behaviour. The lunr search input is rendered by
 * docusaurus-lunr-search with the id `search_input_react`. We ignore the key
 * when the user is already typing in a field so "/" stays usable in prose.
 */
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

if (ExecutionEnvironment.canUseDOM) {
  const isEditable = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditable(e.target)) return;

    const input = document.getElementById('search_input_react') as HTMLInputElement | null;
    if (!input) return;

    e.preventDefault();
    input.focus();
  });
}
