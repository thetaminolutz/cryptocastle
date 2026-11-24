// The journal: active and finished quests, their current objectives and the
// "track" toggle that drives the HUD arrow.
import { QUESTS } from '../data/quests';
import type { QuestLog } from '../game/quests';

export function renderJournal(host: HTMLElement, log: QuestLog, onChange: () => void) {
  host.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'journal';
  const list = document.createElement('div'); list.className = 'jr-list';
  const detail = document.createElement('div'); detail.className = 'jr-detail';
  wrap.append(list, detail);
  host.appendChild(wrap);
  let sel = log.tracked ?? log.active()[0]?.id ?? log.finished()[0]?.id ?? null;

  const draw = () => {
    list.innerHTML = '';
    const section = (title: string, ids: string[]) => {
      if (!ids.length) return;
      const h = document.createElement('div'); h.className = 'jr-head'; h.textContent = title; list.appendChild(h);
      for (const id of ids) {
        const d = QUESTS[id];
        const b = document.createElement('button'); b.className = 'jr-item';
        b.classList.toggle('on', id === sel);
        b.classList.toggle('done', log.isDone(id));
        b.innerHTML = `${log.tracked === id ? '<span class="jr-pin">◆</span>' : ''}${d.chapter ? `<small>Chapter ${d.chapter}</small>` : ''}${d.title}`;
        b.onclick = () => { sel = id; draw(); };
        list.appendChild(b);
      }
    };
    const act = log.active().map((q) => q.id), fin = log.finished().map((q) => q.id).reverse();
    section('Main story', act.filter((id) => QUESTS[id].chapter));
    section('Side quests', act.filter((id) => !QUESTS[id].chapter));
    section('Finished', fin);
    if (!act.length && !fin.length) list.innerHTML = '<p class="jr-empty">Nothing written here yet.</p>';

    detail.innerHTML = '';
    if (!sel) return;
    const d = QUESTS[sel], st = log.get(sel)!;
    const h = document.createElement('h3'); h.textContent = d.title;
    const p = document.createElement('p'); p.className = 'jr-desc'; p.textContent = d.desc;
    detail.append(h, p);
    if (!st.done) {
      const stage = document.createElement('p'); stage.className = 'jr-stage'; stage.textContent = d.stages[st.stage].text;
      const ul = document.createElement('ul'); ul.className = 'jr-obj';
      for (const o of log.objectives(sel)) { const li = document.createElement('li'); li.textContent = o.text; li.classList.toggle('done', o.done); ul.appendChild(li); }
      const track = document.createElement('button'); track.className = 'btn';
      track.textContent = log.tracked === sel ? 'Tracking ◆' : 'Track this quest';
      track.onclick = () => { log.tracked = log.tracked === sel ? null : sel; onChange(); draw(); };
      detail.append(stage, ul, track);
      // past stages
      for (let i = st.stage - 1; i >= 0; i--) { const old = document.createElement('p'); old.className = 'jr-past'; old.textContent = '✓ ' + d.stages[i].objectives.map((o) => o.text).join(', '); detail.appendChild(old); }
    } else {
      const done = document.createElement('p'); done.className = 'jr-stage'; done.textContent = `Finished on day ${(st.finished ?? 0) + 1}.`;
      detail.appendChild(done);
    }
  };
  draw();
}
