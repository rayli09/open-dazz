import './style.css'

// open-fuji web shell (M1): drop an image, see it.
// M2 wires the Rust core (compiled to WASM) in: recipe + LUT applied
// in-browser, before/after slider, export. See ../README.md roadmap.

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <h1>open-fuji</h1>
  <p>Film simulations &amp; style filters — recipes + LUTs, in your browser.</p>
  <div id="drop">
    <p>Drop an image here, or click to pick one.</p>
    <input id="file" type="file" accept="image/*" hidden />
    <img id="preview" alt="" hidden />
  </div>
  <p id="status">Engine: web shell only — WASM core lands in M2.</p>
`

const drop = document.querySelector<HTMLDivElement>('#drop')!
const input = document.querySelector<HTMLInputElement>('#file')!
const preview = document.querySelector<HTMLImageElement>('#preview')!
const status = document.querySelector<HTMLParagraphElement>('#status')!

drop.addEventListener('click', () => input.click())
drop.addEventListener('dragover', (e) => e.preventDefault())
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  const f = e.dataTransfer?.files[0]
  if (f) show(f)
})
input.addEventListener('change', () => {
  const f = input.files?.[0]
  if (f) show(f)
})

function show(f: File) {
  preview.src = URL.createObjectURL(f)
  preview.hidden = false
  status.textContent = `${f.name} loaded. Filtering arrives with the WASM core (M2).`
}
