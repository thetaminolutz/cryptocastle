// Opening screens: "Enter. Or turn back." and the title screen.
const ui = () => document.getElementById('ui')!;

function button(text: string, primary: boolean, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = primary ? 'btn primary' : 'btn';
  b.textContent = text;
  b.addEventListener('click', onTap);
  return b;
}

export function showTitle(onBegin: () => void) {
  const s = document.createElement('div');
  s.className = 'screen';
  s.style.background = 'radial-gradient(ellipse at 50% 120%, #3a0a10 0%, #0a0608 55%, #000 100%)';
  const logo = document.createElement('div'); logo.className = 'title-logo'; logo.textContent = 'DUSKMERE';
  const sub = document.createElement('div'); sub.className = 'title-sub'; sub.textContent = 'SOMETHING IS WATCHING';
  const row = document.createElement('div'); row.className = 'row';
  row.append(button('Begin', true, () => { s.remove(); onBegin(); }));
  s.append(logo, sub, row);
  ui().appendChild(s);
}

export function showEnter(onEnter: () => void, onTurnBack: () => void) {
  const s = document.createElement('div');
  s.className = 'screen';
  const t = document.createElement('div'); t.className = 'enter-text'; t.textContent = 'Enter. Or turn back.';
  const row = document.createElement('div'); row.className = 'row';
  row.append(
    button('Enter', true, () => { s.remove(); onEnter(); }),
    button('Turn back', false, () => { s.remove(); onTurnBack(); })
  );
  s.append(t, row);
  ui().appendChild(s);
}
