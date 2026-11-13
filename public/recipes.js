/* Recipes: a simple place to keep the meals you cook. Stored with the rest of your (encrypted) data in db.recipes:
   { id, name, servings, ingredients: [lines], steps: [lines], notes, added }. An ingredient line ending in ":" is a heading. */
'use strict';
const recipeLines = s => String(s || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const recipeById = id => (db.recipes || []).find(r => r.id === id);

function vRecipes() {
  const rs = [...(db.recipes || [])].sort((a, b) => a.name.localeCompare(b.name));
  return `
  <div class="toolbar"><h2 style="margin:0;flex:1">Recipes</h2><button class="btn primary" data-recipenew>Add a recipe</button></div>
  ${rs.length ? `<div class="card"><div class="card-b"><ul class="list">${rs.map(r => `
    <li class="row"><div class="main click" data-recipe="${esc(r.id)}" style="cursor:pointer">
      <div class="title">${esc(r.name)}</div>
      <div class="meta">${r.ingredients.filter(l => !l.endsWith(':')).length} ingredients · ${r.steps.length} step${r.steps.length === 1 ? '' : 's'}${r.servings ? ' · serves ' + esc(r.servings) : ''}</div>
    </div></li>`).join('')}</ul></div></div>`
    : '<div class="card"><div class="card-b muted">No recipes yet. Add the meals you cook so they’re all in one place.</div></div>'}`;
}
function recipeHtml(r) {
  const ing = r.ingredients.map(l => l.endsWith(':') ? `</ul><h4 class="rc-sub">${esc(l.slice(0, -1))}</h4><ul class="rc-ing">` : `<li>${esc(l)}</li>`).join('');
  return `<div class="recipe">
    ${r.servings ? `<p class="muted small">Serves ${esc(r.servings)}</p>` : ''}
    <h3>Ingredients</h3><ul class="rc-ing">${ing}</ul>
    <h3>Steps</h3><ol class="rc-steps">${r.steps.map(s => `<li>${esc(s.replace(/^\d+[.)]\s*/, ''))}</li>`).join('')}</ol>
    ${r.notes ? `<h3>Notes</h3><p>${esc(r.notes).replace(/\n/g, '<br>')}</p>` : ''}
  </div>`.replace(/<ul class="rc-ing"><\/ul>/g, '');
}
function openRecipe(id) {
  const r = recipeById(id); if (!r) return;
  open(`${head(esc(r.name))}<div class="m-b">${recipeHtml(r)}
    <div class="actions" style="margin-top:14px"><button class="btn" data-recipeedit="${esc(r.id)}">Edit</button><button class="btn" data-recipeprint="${esc(r.id)}">Print</button></div></div>`);
}
function openRecipeEdit(id) {
  const r = id ? recipeById(id) : { id: '', name: '', servings: '', ingredients: [], steps: [], notes: '' };
  open(`${head(r.id ? 'Edit recipe' : 'Add a recipe')}
  <form id="recipeform" class="m-b" style="margin-top:12px">
    <label class="f">Name<input name="name" value="${esc(r.name)}" required></label>
    <label class="f">Serves<input name="servings" value="${esc(r.servings || '')}" placeholder="e.g. 4" style="max-width:120px"></label>
    <label class="f">Ingredients <span class="muted small">— one per line; end a line with “:” for a heading</span><textarea name="ingredients" rows="8">${esc(r.ingredients.join('\n'))}</textarea></label>
    <label class="f">Steps <span class="muted small">— one per line</span><textarea name="steps" rows="6">${esc(r.steps.join('\n'))}</textarea></label>
    <label class="f">Notes<textarea name="notes" rows="2">${esc(r.notes || '')}</textarea></label>
    <div class="actions"><button class="btn primary">Save</button>${r.id ? `<button type="button" class="btn danger" data-recipedel="${esc(r.id)}">Delete</button>` : ''}</div>
  </form>`);
  $('#recipeform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    Object.assign(r, { name: f.get('name').trim(), servings: f.get('servings').trim(), ingredients: recipeLines(f.get('ingredients')), steps: recipeLines(f.get('steps')), notes: f.get('notes').trim() });
    db.recipes ||= [];
    if (!r.id) { r.id = uniqueId('recipe-' + r.name, db.recipes); r.added = today(); db.recipes.push(r); }
    view = 'recipes'; close(); save('Recipe saved');
  });
}
function printRecipe(id) {
  const r = recipeById(id), w = window.open('', '_blank'); if (!r || !w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(r.name)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px}h4{margin:12px 0 4px}</style><h1>${esc(r.name)}</h1>${recipeHtml(r)}<script>print()<\/script>`);
  w.document.close();
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-recipe],[data-recipenew],[data-recipeedit],[data-recipedel],[data-recipeprint]'); if (!el) return;
  e.preventDefault(); const D = el.dataset;
  if (D.recipenew !== undefined) openRecipeEdit(null);
  else if (D.recipeedit) openRecipeEdit(D.recipeedit);
  else if (D.recipeprint) printRecipe(D.recipeprint);
  else if (D.recipedel) { if (confirm('Delete this recipe?')) { tomb('recipes', D.recipedel); db.recipes = db.recipes.filter(r => r.id !== D.recipedel); close(); save('Recipe deleted'); } }
  else if (D.recipe) openRecipe(D.recipe);
});
