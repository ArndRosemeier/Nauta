/** A button on the page (the bench's, the crew trial's, the standpoints'): its label, and what a click or a tap does. */
export function makeButton(label: string, pressed: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', pressed);
  return b;
}
