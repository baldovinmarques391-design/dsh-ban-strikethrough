// Pre-install check for the official channel: `node bundle-check.mjs [runtimeDir]`
//
// The UI's "add plugin" dialog accepts an absolute directory, then the Host's
// plugin manager: (1) requires the path to exist, (2) reads its package.json,
// (3) requires a `name`, (4) refuses anything that declares no `dsh.bundle`,
// and (5) parses every patch file `dsh.bundle.patch` names with the harness's
// OWN loader. This script performs exactly those steps offline, so a refusal is
// caught here instead of in the dialog.
//
// It adds the two checks a CLIENT plugin needs on top of the Host-only shape
// (`dsh-ban-wait`'s script):
//   - `dsh.client` declares `platform: 'web'`;
//   - the `./client` export resolves to a file that is also shipped, because
//     that exact path is what the module registry snapshots, serves, and runs
//     in the page. A declaration pointing at nothing fails activation loudly.
//
// It proves the package is acceptable and its patch parses. It does NOT prove
// activation, and it cannot prove what the browser renders: installing the
// bundle is what composes it, and only the open page shows the result.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectDir = fileURLToPath(new URL('.', import.meta.url))
const runtimeDir = process.argv[2] ?? process.env.DSH_RUNTIME
const fail = (message) => { console.log(`FAIL  ${message}`); process.exitCode = 1 }
const pass = (message) => console.log(`PASS  ${message}`)
const withoutDotSlash = (value) => value.replace(/^\.\//, '')

// 1. package.json, as the manager reads it.
let manifest
try {
	manifest = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
	pass('package.json parses')
} catch (error) {
	fail(`package.json unreadable: ${error.message}`)
	process.exit(1)
}

if (typeof manifest.name === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(manifest.name)) pass(`name is a registry-legal package name: ${manifest.name}`)
else fail(`name is missing or not a package name: ${JSON.stringify(manifest.name)}`)

const patch = manifest.dsh?.bundle?.patch
if (typeof patch === 'string' && patch.length > 0) pass(`declares dsh.bundle.patch: ${patch}`)
else fail('declares no dsh.bundle — the dialog would refuse it as "not-a-bundle"')

// 2. Every file the loader or the browser will read at mount time must be
//    shipped: a `file:` dependency lands in node_modules as a copy honouring
//    `files`, and a `link:` install is immune only while it stays a link.
//    `files` entries may be globs (`locale/*.json`), so match them as globs.
const shipped = manifest.files?.map(withoutDotSlash)
const isShipped = (relative) => shipped === undefined || shipped.some((entry) => {
	const pattern = new RegExp(`^${entry.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
	return pattern.test(relative)
})
for (const required of ['index.js', patch, 'client.js', 'locale/en.json', 'locale/zh.json']) {
	if (typeof required !== 'string') continue
	const relative = withoutDotSlash(required)
	if (existsSync(join(projectDir, relative)) && isShipped(relative)) pass(`shipped and present: ${relative}`)
	else fail(`must exist AND be listed in "files" to reach node_modules: ${relative}`)
}
if (manifest.type !== 'module') fail('type must be "module": the plugin is ESM')

// 3. The browser half: `dsh.client` is what client-modules scans, and the
//    `./client` export is the path it snapshots for the page bundle.
const client = manifest.dsh?.client
if (client?.platform === 'web') pass('declares dsh.client.platform "web"')
else fail(`declares no web client half: ${JSON.stringify(client)}`)

const clientExport = manifest.exports?.['./client']
if (typeof clientExport === 'string' && existsSync(join(projectDir, withoutDotSlash(clientExport)))) {
	pass(`./client export resolves: ${clientExport}`)
} else {
	fail(`./client export does not resolve to a file: ${JSON.stringify(clientExport)}`)
}

if (typeof clientExport === 'string' && existsSync(join(projectDir, withoutDotSlash(clientExport)))) {
	const source = readFileSync(join(projectDir, withoutDotSlash(clientExport)), 'utf8')
	if (source.includes('window.__ModuleLoader__.load(')) pass('client bundle registers through window.__ModuleLoader__.load')
	else fail('client bundle does not register a factory through window.__ModuleLoader__.load')
	if (source.includes(`id: '${manifest.name}'`)) pass(`client bundle id equals the package name (${manifest.name})`)
	else fail(`client bundle id does not equal ${JSON.stringify(manifest.name)}: the page would register the wrong module`)
}

// 4. Parse the patch list with the harness's own loader.
const bootEntry = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')
if (!existsSync(bootEntry)) {
	fail(`cannot reach the harness loader at ${bootEntry}; pass the runtime directory as an argument`)
	process.exit(1)
}
const boot = await import(pathToFileURL(bootEntry).href)
const patches = boot.loadOverlayPatches('bundle-check', join(projectDir, patch))
pass(`loader parsed ${patches.length} patch entr${patches.length === 1 ? 'y' : 'ies'}`)

const inserts = patches.flatMap((entry) => entry.insert ?? [])
for (const row of inserts) {
	if (typeof row.id === 'string' && typeof row.name === 'string') pass(`insert row: id=${row.id} name=${row.name} config=${JSON.stringify(row.config ?? {})}`)
	else fail(`insert row is missing id/name: ${JSON.stringify(row)}`)
}

if (inserts.some((row) => row.name === manifest.name)) pass(`row name matches the package name (${manifest.name})`)
else fail(`no insert row names ${JSON.stringify(manifest.name)}: the bundle would mount nothing`)

console.log(process.exitCode === 1 ? '\nbundle is NOT installable as-is' : '\nbundle is acceptable to the official installer')
